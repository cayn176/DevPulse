const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function signWindows(file) {
  const thumbprint = process.env.DEVPULSE_SIGN_CERT_SHA1;
  if (!thumbprint) {
    if (process.env.DEVPULSE_REQUIRE_SIGNING === '1') throw Error('A trusted code-signing certificate is required.');
    return;
  }
  if (!/^[0-9a-f]{40}$/i.test(thumbprint)) throw Error('Invalid certificate thumbprint.');
  const tool = process.env.DEVPULSE_SIGNTOOL || 'signtool.exe';
  if (process.env.DEVPULSE_SIGNTOOL && (!path.isAbsolute(tool) || !fs.existsSync(tool))) throw Error('Set a valid Windows SDK SignTool path.');
  for (const args of [
    ['sign','/s','My','/sha1',thumbprint,'/fd','SHA256','/tr','http://timestamp.digicert.com','/td','SHA256',file],
    ['verify','/pa','/all','/v',file]
  ]) {
    const result = spawnSync(tool,args,{stdio:'inherit',windowsHide:true});
    if (result.status !== 0) throw Error('SignTool failed for '+path.basename(file));
  }
}

if (require.main === module) signWindows(process.argv[2]);
module.exports = { signWindows };

