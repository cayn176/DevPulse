const path = require('node:path');
const fs = require('node:fs');
const EXTERNAL_HOSTS = ['github.com', 'openai.com', 'chatgpt.com', 'claude.com', 'anthropic.com', 'cursor.com', 'vercel.com', 'vercel.app', 'visualstudio.com', 'ollama.com', 'git-scm.com', 'code.visualstudio.com'];

function allowedExternal(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && EXTERNAL_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

function trustedSender(event, origin, window) {
  return Boolean(event.senderFrame && event.senderFrame === window.webContents.mainFrame && event.sender === window.webContents && new URL(event.senderFrame.url).origin === origin);
}

function approvedPath(requested, selectedFolders) {
  if (typeof requested !== 'string' || requested.length > 4096) throw new Error('Invalid project path.');
  const resolved = fs.realpathSync(requested);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Choose a project directory.');
  if (![...selectedFolders].some(folder => {
    const relative = path.relative(folder, resolved);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  })) throw new Error('Choose this project folder in the desktop picker first.');
  return resolved;
}

module.exports = { allowedExternal, trustedSender, approvedPath };
