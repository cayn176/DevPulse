const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { allowedExternal, trustedSender, approvedPath } = require('./security.cjs');

let apiProcess;
let mainWindow;
let origin;
let closing = false;
const selectedFolders = new Set();
const root = path.resolve(__dirname, '..');
const smoke = process.argv.includes('--smoke-test');

if (smoke) {
  const os = require('node:os');
  app.setPath('userData', fsSync.mkdtempSync(path.join(os.tmpdir(), 'devpulse-smoke-')));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

async function encryptionKey(dataDir) {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('An OS credential store is required. Encryption is unavailable on this computer.');
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') throw new Error('Configure an OS keyring before starting DevPulse. Plain-text secret storage is not supported.');
  const keyFile = path.join(dataDir, 'credential-key.enc');
  try {
    const value = await safeStorage.decryptStringAsync(await fs.readFile(keyFile));
    if (value.shouldReEncrypt) await fs.writeFile(keyFile, await safeStorage.encryptStringAsync(value.result), { mode: 0o600 });
    return value.result;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('The local credential key could not be unlocked. Restore the original OS account/key backup; DevPulse will not overwrite it.');
    const key = crypto.randomBytes(32).toString('base64').replaceAll('+', '-').replaceAll('/', '_');
    await fs.writeFile(keyFile, await safeStorage.encryptStringAsync(key), { flag: 'wx', mode: 0o600 });
    return key;
  }
}

async function startBackend(dataDir, desktopSession) {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const nonce = crypto.randomBytes(32).toString('hex');
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'api', 'python', 'python.exe')
    : path.join(root, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const args = app.isPackaged ? ['-I', '-B', path.join(process.resourcesPath, 'api', 'desktop', 'api_entry.py')] : [path.join(root, 'desktop', 'api_entry.py')];
  const front = app.isPackaged ? path.join(process.resourcesPath, 'frontend') : path.join(root, 'frontend', 'dist');
  if (!fsSync.existsSync(path.join(front, 'index.html'))) throw new Error('Frontend build missing. Run npm run build:frontend first.');
  const childEnv = { ...process.env, PORT: String(port), FRONTEND_ORIGIN: origin, GITHUB_REDIRECT_URI: origin + '/auth/github/callback',
    APP_ENV: 'desktop', DEVPULSE_DESKTOP: 'true', DESKTOP_SESSION_NONCE: nonce,
    DEVPULSE_FRONTEND_DIST: front, DEVPULSE_DATA_DIR: dataDir, DEVPULSE_WORKSPACE_ROOT: path.join(dataDir, 'workspaces'),
    DATABASE_URL: 'sqlite:///' + path.join(dataDir, 'devpulse.db').replaceAll('\\', '/'),
    TOKEN_ENCRYPTION_KEY: await encryptionKey(dataDir), COOKIE_SECURE: 'false' };
  // Do not inherit credentials from a developer's terminal into an unrelated installed app.
  for (const key of Object.keys(childEnv)) {
    if (/API_KEY|CLIENT_SECRET/.test(key)) delete childEnv[key];
  }
  apiProcess = spawn(executable, args, { cwd: dataDir, env: childEnv, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let startupError = false;
  let exited = false;
  apiProcess.once('error', () => { startupError = true; });
  apiProcess.once('exit', () => { exited = true; if (!closing && mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('DevPulse API stopped', 'The local service stopped unexpectedly. Restart DevPulse to recover the session.'); });
  // Keep bounded diagnostic output out of the renderer and out of logs containing credentials.
  apiProcess.stderr.on('data', () => {});
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (startupError || exited) throw new Error('The local API could not start. Check that the bundled runtime is permitted on this computer.');
    try {
      const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch { /* bounded readiness retry */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const response = await fetch(origin + '/auth/desktop', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ nonce }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Desktop session could not be established. The packaged API and desktop versions must match.');
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('devpulse_session='));
  if (!cookie) throw new Error('Desktop session cookie was not provided.');
  const value = cookie.split(';', 1)[0].slice('devpulse_session='.length);
  await desktopSession.cookies.set({ url: origin, name: 'devpulse_session', value, httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
}

function handler(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!mainWindow || !trustedSender(event, origin, mainWindow)) throw new Error('Untrusted IPC sender.');
    return action(...args);
  });
}

async function boot() {
  const dataDir = app.getPath('userData');
  await fs.mkdir(dataDir, { recursive: true });
  const desktopSession = session.fromPartition('devpulse-' + crypto.randomBytes(12).toString('hex'));
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  await startBackend(dataDir, desktopSession);
  const savePrefs = await require('./preferences.cjs').restore(dataDir, desktopSession, origin);
  desktopSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (details.url.startsWith(origin + '/')) headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"];
    callback({ responseHeaders: headers });
  });
  mainWindow = new BrowserWindow({ width: 1460, height: 940, minWidth: 900, minHeight: 640, title: 'DevPulse', backgroundColor: '#0a0a0a', show: !smoke, autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: !smoke, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, session: desktopSession, devTools: !app.isPackaged } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (allowedExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) { event.preventDefault(); if (allowedExternal(url)) shell.openExternal(url); } });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  handler('devpulse:appearance', savePrefs);
  handler('devpulse:choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose a project folder', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = await fs.realpath(result.filePaths[0]);
    selectedFolders.add(folder);
    return folder;
  });
  handler('devpulse:open-vscode', async requested => {
    const folder = approvedPath(requested, selectedFolders);
    // A fixed protocol with a verified path; never an arbitrary shell command.
    const uri = 'vscode://file/' + folder.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/');
    await shell.openExternal(uri);
    return { ok: true };
  });
  handler('devpulse:open-external', async url => { if (!allowedExternal(url)) throw new Error('This external URL is not allowed.'); await shell.openExternal(url); return { ok: true }; });
  handler('devpulse:app-info', () => ({ version: app.getVersion(), platform: process.platform, credentialStorage: 'OS-protected encryption', updates: 'Manual updates; no feed configured' }));
  await mainWindow.loadURL(origin + '/app');
  if (smoke) {
    await require('./smoke.cjs').smoke(mainWindow, origin, desktopSession);
    app.quit();
  }
}

app.on('before-quit', () => { closing = true; if (apiProcess && !apiProcess.killed) { apiProcess.stdin.end(); setTimeout(() => { if (!apiProcess.killed) apiProcess.kill(); }, 3000).unref(); } });
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else { app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } }); app.whenReady().then(boot).catch(error => { if (smoke) { process.exitCode=1; process.stderr.write('DEVPULSE_DESKTOP_SMOKE_FAILED: ' + error.message + '\n'); } else dialog.showErrorBox('DevPulse could not start', error.message); app.quit(); }); }
