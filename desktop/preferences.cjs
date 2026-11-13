const fs = require('node:fs/promises');
const path = require('node:path');
const allowed = {
  'dp-rail':['compact','expanded'],
  'dp-accent':['relay','steel'],
  'devpulse-theme': ['light','dark','system'],
  'dp-display-0':['0','1'],
  'dp-display-1':['0','1'],
  'dp-display-2':['0','1']
};
function sanitize(prefs) {
  return Object.fromEntries(Object.entries(prefs || {}).filter(([k,v]) => Object.hasOwn(allowed,k) && allowed[k].includes(v)));
}
async function restore(dataDir, session, origin) {
  const file = path.join(dataDir,'appearance.json');
  let values = {};
  try { values = sanitize(JSON.parse(await fs.readFile(file,'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  // This allowlisted preference cookie contains only display settings. The API session stays HttpOnly.
  await session.cookies.set({url:origin, name:'devpulse_appearance',value:encodeURIComponent(JSON.stringify(values)),path:'/',sameSite:'strict'});
  let queue = Promise.resolve();
  return prefs => {
    const content = JSON.stringify(sanitize(prefs));
    queue = queue.catch(()=>{}).then(async()=>{
      await fs.writeFile(file+'.tmp',content);
      await fs.rename(file+'.tmp',file);
    });
    return queue;
  };
}
module.exports={restore};

