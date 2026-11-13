const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
if(process.platform!=='win32')throw Error('Windows installer builds require Windows.');
const python=path.join(root,'backend','.venv','Scripts','python.exe');
for(const script of ['make-icon.py','bundle-runtime.py']){
 const result=spawnSync(python,[path.join(__dirname,script)],{cwd:root,stdio:'inherit',windowsHide:true});
 if(result.status!==0)process.exit(result.status||1);
}
