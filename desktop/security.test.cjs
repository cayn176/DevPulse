const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { allowedExternal, trustedSender, approvedPath } = require('./security.cjs');
test('external URLs require HTTPS, an allowed host and no embedded credentials', () => {
  assert.equal(allowedExternal('https://github.com/settings'), true);
  assert.equal(allowedExternal('https://preview.vercel.app'), true);
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'https://github.com.attacker.example', 'https://user:secret@github.com', 'https://github.com:8443']) assert.equal(allowedExternal(url), false);
});
test('IPC is restricted to the local main frame', () => {
  const frame = { url: 'http://127.0.0.1:56000/app' };
  const contents = { mainFrame: frame };
  assert.equal(trustedSender({ senderFrame: frame, sender: contents }, 'http://127.0.0.1:56000', { webContents: contents }), true);
  assert.equal(trustedSender({ senderFrame: { url: frame.url }, sender: contents }, 'http://127.0.0.1:56000', { webContents: contents }), false);
});
test('editor opening is restricted to explicitly picked directories', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-security-'));
  const child = path.join(folder, 'project'); fs.mkdirSync(child);
  assert.equal(approvedPath(child, new Set([folder])), fs.realpathSync(child));
  assert.throws(() => approvedPath(os.tmpdir(), new Set([folder])));
  fs.rmdirSync(child); fs.rmdirSync(folder);
});
