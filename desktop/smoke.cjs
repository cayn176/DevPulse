const fs = require('node:fs/promises');
const path = require('node:path');

async function until(window, expression, description) {
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 160));
  }
  throw new Error('Desktop UI did not render ' + description);
}

async function smoke(window, origin, desktopSession) {
  const cookie = (await desktopSession.cookies.get({ name: 'devpulse_session' })).map(c => c.name + '=' + c.value).join('; ');
  const headers = { Cookie: cookie, Origin: origin, 'Content-Type':'application/json' };
  const get = async route => {
    const reply = await fetch(origin + route, { headers });
    if (!reply.ok) throw new Error('Smoke API failed: ' + route + ' ' + reply.status);
    return reply.json();
  };
  if ((await get('/api/me')).login !== 'local') throw new Error('Isolated desktop session unavailable.');
  for (const route of ['/api/runtime/providers','/api/local-work/workflows','/api/local-work/tasks','/api/projects','/api/vercel/status']) await get(route);
  const denied = await fetch(origin + '/api/runtime/providers');
  if (denied.status !== 401) throw new Error('Expected authenticated runtime routes.');
  const projectReply = await fetch(origin + '/api/projects', {method:'POST', headers, body:JSON.stringify({name:'SmokeProject', description:'Isolated installer verification', action:'create', confirm:true})});
  if (!projectReply.ok) throw new Error('Test project creation returned '+projectReply.status+' '+(await projectReply.text()).slice(0,200));
  const project = await projectReply.json();
  const routes = ['','agents','conversations','models','sessions','projects','code?project='+project.id,'git?project='+project.id,'assistant','automation','tasks','deployments','deployment-history','environments','integrations','connected-apps','guides','settings','security','help'];
  for (const route of routes) {
    process.stdout.write('Checking ' + (route.split('?')[0] || 'overview') + '\n');
    const deadline = new Promise((_, reject)=>{const timeout=setTimeout(()=>reject(new Error('Navigation timed out: '+route)), 20000); timeout.unref()});
    await Promise.race([window.loadURL(origin + '/app/' + route), deadline]);
    await until(window, '!!document.querySelector("main h1") && !!document.querySelector("nav")', route||'overview');
    if (route.startsWith('code?')) {
      await until(window, '[...document.querySelectorAll("button")].some(b=>b.textContent.includes("README.md"))', 'file explorer');
      await window.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("README.md")).click()');
      await until(window,'!!document.querySelector(".monaco-editor")','Monaco editor');
    }
    if (route === 'integrations' && process.env.DEVPULSE_SMOKE_CAPTURE) {
      await until(window,'document.querySelector("main").innerText.includes("Vercel")','integration cards');
      const bitmap = await window.webContents.capturePage();
      await fs.writeFile(path.resolve(process.env.DEVPULSE_SMOKE_CAPTURE), bitmap.toPNG());
    }
  }
  process.stdout.write('DEVPULSE_DESKTOP_SMOKE_OK ' + routes.length + ' pages, authenticated API, project and editor\n');
}
module.exports = { smoke };

