const {app,BrowserWindow}=require('electron')
const http=require('node:http'),fs=require('node:fs'),path=require('node:path')
const dist=path.resolve(process.argv[2]||'../site-preview/dist')
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(dist,'.'+decodeURIComponent(url.pathname)),asset=file===dist?path.join(dist,'index.html'):file
 if(!asset.startsWith(dist+path.sep)||!fs.existsSync(asset)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(asset)]||'application/octet-stream');fs.createReadStream(asset).pipe(res)
})
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms))
app.whenReady().then(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
 const base='http://127.0.0.1:'+server.address().port
 const window=new BrowserWindow({show:false,width:1480,height:940,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}})
 window.webContents.on('console-message',(_e,msg)=>{if(msg.level==='error')console.log('Renderer:',msg.message.slice(0,180))})
 for(const route of ['','projects','agents','sessions','automation','tasks','deployments','deployments/sample-build-1','environments','integrations','assistant','help']){
  await window.loadURL(base+'/?view='+encodeURIComponent(route)+'#/app/'+route)
  let title=''
  for(let i=0;i<50&&!title;i++){await sleep(100);title=await window.webContents.executeJavaScript('document.querySelector("main h1")?.innerText||""')}
  if(!title)throw Error('Missing page heading: '+route+' '+await window.webContents.executeJavaScript('document.body.innerText.slice(0,140)'))
  console.log(route||'overview',title)
  if(route==='integrations'){await sleep(300);fs.writeFileSync(path.join(path.dirname(dist),'preview-integrations.png'),(await window.webContents.capturePage()).toPNG())}
 }
 for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1600,900],[1920,1080]]){
   window.setSize(width,height)
   for(const mode of ['light','dark']){
     await window.webContents.executeJavaScript('localStorage.setItem("devpulse-theme",'+JSON.stringify(mode)+')')
     await window.loadURL(base+'/?qa='+width+'-'+mode+'#/app/integrations')
     let valid=false
     for(let i=0;i<55&&!valid;i++){await sleep(75);valid=await window.webContents.executeJavaScript('document.documentElement.dataset.theme==='+JSON.stringify(mode)+' && !!document.querySelector("main h1") && document.documentElement.scrollWidth <= innerWidth+2')}
     if(!valid)throw Error('Layout check failed '+width+' '+mode)
   }
 }
 console.log('Browser preview verified, including both themes at five desktop sizes')
}).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{server.close();app.quit()})
