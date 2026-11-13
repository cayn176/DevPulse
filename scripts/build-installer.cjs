const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {version}=require(path.join(root,'package.json'));
const {getMakeNsisPath,getNsisPluginsPath}=require('app-builder-lib/out/toolsets/windows');
const file='DevPulse-Offline-'+version+'-x64.exe';
const release=path.join(root,'release');
const offline=path.join(release,file);
const output=path.join(release,'DevPulse-Setup-'+version+'-x64.exe');
async function build(){
 const nsis=await getMakeNsisPath();
 const compiler=nsis.path;
 const plugins=path.join(await getNsisPluginsPath(),'x86-unicode');
 const buildEnv={...process.env,...nsis.env};
 const appDir=path.join(release,'win-unpacked');
 const manifest=path.join(release,'uninstall-files.nsh');
 const directives=[];
 function walk(rel){
  for(const item of fs.readdirSync(path.join(appDir,rel),{withFileTypes:true})){
   const child=path.join(rel,item.name);
   const dest='"$INSTDIR\\app\\'+child.replaceAll('$','$$')+'"';
   if(item.isDirectory()){walk(child);directives.push('RMDir '+dest)}
   else directives.push('Delete '+dest);
  }
 }
 walk('');
 fs.writeFileSync(manifest,'\uFEFF'+directives.join('\r\n'));
 const offlineArgs=['/V2','/DVERSION='+version,'/DICON='+path.join(root,'desktop/assets/icon.ico'),'/DAPP_DIR='+appDir,'/DUNINSTALL_LIST='+manifest,'/DOFFLINE_OUTPUT='+offline,path.join(__dirname,'installer/offline.nsi')];
 const compiled=spawnSync(compiler,offlineArgs,{stdio:'inherit',windowsHide:true,env:buildEnv});if(compiled.status!==0)process.exit(compiled.status||1);
 const hash=crypto.createHash('sha512');
 for await (const chunk of fs.createReadStream(offline))hash.update(chunk);
 const defs={VERSION:version,ICON:path.join(root,'desktop/assets/icon.ico'),OUTPUT:output,CHECKSUM:hash.digest('hex').toUpperCase(),DOWNLOAD_URL:'https://github.com/cayn176/DevPulse/releases/download/v'+version+'/'+file,PLUGIN_DIRECTORY:plugins,UTIL_INCLUDE:path.join(root,'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh')};
 const args=['/V2',...Object.entries(defs).map(([k,v])=>'/D'+k+'='+v),path.join(__dirname,'installer/bootstrap.nsi')];
 const result=spawnSync(compiler,args,{stdio:'inherit',windowsHide:true,env:buildEnv});if(result.status!==0)process.exit(result.status||1);
 const sums=[];
 for(const artifact of [output,offline]){
  const digest=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(artifact))digest.update(chunk);
  sums.push(digest.digest('hex')+'  '+path.basename(artifact));
 }
 fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),sums.join('\n')+'\n');
}
build().catch(e=>{console.error(e.message);process.exitCode=1});
