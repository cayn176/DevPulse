/* Offline browser preview. All sample state belongs to this origin. */
(() => {
  const stamp = Date.now(), iso = new Date(stamp).toISOString()
  const groups = ['Atlas Web', 'Pulse API', 'Studio Docs']
  const projects = groups.map((name,i)=>({id:'preview-'+i,name,path:'~/workspace/'+name.toLowerCase().replace(' ','-'),description:['Customer-facing web application','Service endpoints and authentication','Developer documentation'][i],language:['TypeScript','Python','TypeScript'][i],framework:['React','FastAPI','Astro'][i],created_at:iso,last_opened:iso}))
  const demoRepos=projects.map((p,i)=>({id:p.id,github_id:i+1,name:p.name.toLowerCase().replace(' ','-'),full_name:'preview/'+p.name.toLowerCase().replace(' ','-'),owner_login:'preview',description:p.description,html_url:'',clone_url:'',ssh_url:'',homepage:null,visibility:'private',primary_language:p.language,stargazers_count:0,forks_count:0,watchers_count:0,open_issues_count:0,default_branch:'main',license_name:null,topics:[],archived:false,fork:false,created_at_github:iso,updated_at_github:iso,pushed_at_github:iso,favorite:false}))
  const providers=['codex','claude','cursor'].map((id,i)=>({id,name:['OpenAI Codex','Claude Agent','Cursor Agent'][i],installed:false,status:'not_connected',models:[],capabilities:{modes:['ask']}}))
  const sessions=projects.slice(0,2).map((p,i)=>({id:'sample-session-'+i,title:['Review the settings form','Trace a failing preview build'][i],project_id:p.id,provider:providers[i].id,cwd:p.path,status:['idle','interrupted'][i],mode:'ask',messages:[{role:'user',text:'Show the next step for this project.',timestamp:iso},{role:'assistant',text:'Review the project files and the working tree before starting a new change. This is an example transcript.',timestamp:iso}],events:[{seq:i+1,provider:providers[i].id,session_id:'sample-session-'+i,type:'turn_completed',data:{},timestamp:iso}],updated_at:iso,pinned:i===0,archived:false}))
  const deployments=groups.map((name,i)=>({uid:'sample-build-'+i,name,project_id:projects[i].id,created:stamp-i*3600000-31000,building_at:stamp-i*3600000-28000,completed_at:stamp-i*3600000,state:i===1?'ERROR':'READY',target:i===1?'preview':'production',branch:i===1?'fix/session-timeout':'main',sha:['29bb1c4','8a71f13','9c76ab1'][i],author:'Preview workspace',error:i===1?'A required environment variable is missing in this example build.':null}))
  const seed={tasks:groups.map((p,i)=>({id:'task-'+i,text:['Review onboarding copy','Investigate preview failure','Update project guide'][i],description:'Example task for '+p,project_id:projects[i].id,status:['todo','in_progress','review'][i],priority:['normal','high','low'][i],done:false,created_at:iso})),threads:[],workflows:[{id:'example-review',name:'Review a failed preview build',action:'task',project_id:projects[1].id,instructions:'Inspect the failed build and document the next step.',enabled:true}],runs:[],files:{},newProjects:[]}
  const key='devpulse-preview-v2';let data;try{data=JSON.parse(localStorage.getItem(key))||structuredClone(seed)}catch{data=structuredClone(seed)}
  const save=()=>localStorage.setItem(key,JSON.stringify(data))
  const all=()=>[...projects,...data.newProjects]
  const user={id:'preview',login:'local',name:'Preview workspace',avatar_url:null,bio:null,repository_count:demoRepos.length,synced_at:null,scopes:[]}
  const projectsById=id=>all().find(p=>p.id===id)
  function files(id){return data.files[id]??={'README.md':'# '+(projectsById(id)?.name||'Project')+'\n\nAn editable example in your browser preview.\n','src/index.ts':'export const workspace = "DevPulse"\n'}}
  const respond=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  const localOnly=()=>respond({detail:'This action needs the desktop app and your connected account. Preview changes stay in this browser.'},409)
  function route(u,m,b){
    const path=u.pathname, [,,base,id,action,last]=path.split('/')
    if(path.startsWith('/auth/'))return path==='/auth/status'?respond({oauth_ready:false,token_ready:false,local_ready:false,frontend_origin:location.origin}):localOnly()
    if(base==='me')return respond(user)
    if(base==='overview')return respond({total_repositories:3,public_repositories:0,total_stars:0,total_forks:0,archived_repositories:0,forked_repositories:0,favorites:0,primary_languages:[{language:'TypeScript',repositories:2,share:66.7},{language:'Python',repositories:1,share:33.3}],recently_updated:demoRepos,synced_at:null})
    if(base==='repositories'&&m==='GET')return respond(id?demoRepos.find(r=>r.name===action):{items:demoRepos,total:3,page:1,page_size:20})
    if(base==='repo-tools'&&m==='GET')return respond(last==='readme'?[{id:'sample',title:'README.md',text:'# Preview repository'}]:[])
    if(base==='activity')return respond({items:[],coverage_note:'Sample workspace. Connect GitHub in the desktop app for live events.'})
    if(base==='collections')return respond([])
    if(base==='projects'){
      if(!id && m==='GET')return respond(all().filter(p=>p.name.toLowerCase().includes((u.searchParams.get('q')||'').toLowerCase())&&(!u.searchParams.get('language')||p.language===u.searchParams.get('language'))))
      if(!id&&m==='POST'&&b.action==='create'){const p={...projects[0],id:crypto.randomUUID(),name:b.name,description:b.description,path:'~/preview/'+b.name,language:null,framework:null};data.newProjects.push(p);save();return respond(p)}
      const p=projectsById(id);if(!p)return localOnly()
      if(!action||action==='open')return respond(p)
      if(action==='git'&&m==='GET')return respond({is_repository:true,branch:'main',changes:[],branches:['main'],commits:[]})
      const rel=u.searchParams.get('path')||'', fs=files(id)
      if(action==='tree'){const prefix=rel?rel+'/':'';const entries=new Map();for(const file of Object.keys(fs)){if(!file.startsWith(prefix))continue;const parts=file.slice(prefix.length).split('/');entries.set(parts[0],{name:parts[0],path:prefix+parts[0],directory:parts.length>1,size:fs[file].length})}return respond({items:[...entries.values()],limited:false})}
      if(action==='file'){if(m==='PUT'){fs[b.path]=b.content;save()}const file=b.path||rel;return respond({path:file,content:fs[file]||'',hash:String(fs[file]?.length||0)})}
      if(action==='search')return respond({matches:Object.entries(fs).filter(([,v])=>v.includes(u.searchParams.get('q'))).map(([path,text])=>({path,line:1,text})),limited:false})
      if(action==='diff')return respond({path:rel,original:fs[rel],modified:fs[rel],diff:''})
      return localOnly()
    }
    if(base==='runtime'){if(m!=='GET')return localOnly();if(id==='providers')return respond(providers);if(id==='activity')return respond(sessions);if(id==='approvals')return respond([]);if(action==='sessions')return respond(last?sessions.find(s=>s.id===last):{items:sessions.filter(s=>s.provider===id&&s.project_id===u.searchParams.get('project_id'))});return respond([])}
    if(base==='local-work'){
      if(id==='diagnostics')return respond({git:false,vscode:false,projects:all().length,github_configured:false})
      const items=data[id]
      if(!Array.isArray(items))return localOnly()
      const record=items.find(r=>r.id===action)
      if(id==='workflows'&&last==='preview')return respond({text:record?.instructions||'Prepare a task',revision:'preview'})
      if(id==='workflows'&&last==='run'&&m==='POST'){const task={...seed.tasks[0],id:crypto.randomUUID(),text:record?.instructions||'Review task'};data.tasks.push(task);const run={id:crypto.randomUUID(),workflow_id:action,name:record?.name,task_id:task.id,output:task.text,created_at:new Date().toISOString()};data.runs.unshift(run);save();return respond(run)}
      if(m==='GET')return respond(items)
      if(m==='POST'){const x={...b,id:crypto.randomUUID(),done:false,created_at:iso};items.push(x);save();return respond(x)}
      if(record&&['PATCH','PUT'].includes(m)){Object.assign(record,b);save();return respond(record)}
      if(record&&m==='DELETE'){items.splice(items.indexOf(record),1);save();return respond({ok:true})}
    }
    if(base==='vercel'&&m==='GET'){if(id==='status')return respond({connected:true,username:'Example account'});if(id==='projects')return respond(action?[]:all().map(p=>({...p,git:'github',production_branch:'main'})));if(id==='logs')return respond([{created:stamp-30000,text:'Example build queued'},{created:stamp,text:action==='sample-build-1'?'Error: missing preview configuration':'Example build completed'}]);return respond(action?deployments.find(d=>d.uid===action):deployments.filter(d=>!u.searchParams.get('project')||d.project_id===u.searchParams.get('project')))}
    if(base==='ai'){
      if(id==='connections'&&m==='GET')return respond(['openai','anthropic','cursor'].map(provider=>({provider,connected:false,model:'',local_enabled:false})))
      if(id==='local-models')return respond({models:[]})
      if(id==='threads'){if(!action && m==='POST'){const row={id:crypto.randomUUID(),title:'New conversation',repository:b.repository,messages:[],status:'idle'};data.threads.unshift(row);save();return respond(row)}const row=data.threads.find(t=>t.id===action);if(m==='GET')return respond(row||data.threads);if(m==='DELETE'&&row){data.threads=data.threads.filter(t=>t!==row);save();return respond({ok:true})}if(last==='messages'&&row&&b.provider==='workspace'){row.title=b.text.slice(0,60);row.messages.push({id:crypto.randomUUID(),role:'user',provider:'workspace',text:b.text},{id:crypto.randomUUID(),role:'assistant',provider:'workspace',text:/deploy/i.test(b.text)?'Example deployments: '+deployments.map(d=>d.name+' · '+d.state).join(', '):/project|progett/i.test(b.text)?'Projects in this preview: '+all().map(p=>p.name).join(', '):'Preview workspace tools can list projects and deployments. Open the desktop application for model conversations and repository operations.'});save();return respond(row)}}
    }
    return localOnly()
  }
  const native=window.fetch.bind(window)
  window.fetch=async(input,init={})=>{const u=new URL(input instanceof Request?input.url:input,location.href);if(u.origin===location.origin&&/^\/(api|auth)\//.test(u.pathname)){let b={};try{b=JSON.parse(init.body||'{}')}catch{}return route(u,init.method||'GET',b)}return native(input,init)}
  if(!location.hash.startsWith('#/app'))location.hash='/app'
  const label=document.createElement('div');label.className='preview-label';label.textContent='Interactive preview · Sample workspace · Changes saved in this browser';document.body.append(label)
})()
