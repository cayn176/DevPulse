const { build, Platform, Arch } = require('electron-builder');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname,'..');
const { version } = require('../package.json');
const identityName = process.env.DEVPULSE_STORE_NAME;
const publisher = process.env.DEVPULSE_STORE_PUBLISHER;
const publisherDisplayName = process.env.DEVPULSE_STORE_DISPLAY_NAME;
if (!identityName || !publisher?.startsWith('CN=') || !publisherDisplayName) {
  throw Error('Copy Name, Publisher and PublisherDisplayName from Product identity in Microsoft Partner Center to DEVPULSE_STORE_NAME, DEVPULSE_STORE_PUBLISHER and DEVPULSE_STORE_DISPLAY_NAME.');
}
const prepackaged=path.join(root,'release','win-unpacked');
if (!fs.existsSync(path.join(prepackaged,'DevPulse.exe'))) throw Error('Run npm run pack:desktop first.');
build({projectDir:root,prepackaged,publish:"never",targets:Platform.WINDOWS.createTarget(['appx'],Arch.x64),
  config:{appx:{identityName,publisher,publisherDisplayName,displayName:'DevPulse',applicationId:'DevPulse',artifactName:'DevPulse-Store-'+version+'-x64.appx'}}})
  .catch(error=>{console.error(error.message);process.exitCode=1});

