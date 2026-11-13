type Bridge = { isDesktop?:boolean; saveAppearance?:(values:Record<string,string>)=>Promise<void> }
const keys = ['dp-rail','dp-accent','devpulse-theme','dp-display-0','dp-display-1','dp-display-2']
const bridge = (window as unknown as {devpulse?:Bridge}).devpulse
if (bridge?.isDesktop) {
  const saved = document.cookie.split('; ').find(item=>item.startsWith('devpulse_appearance='))
  if (saved && !sessionStorage.getItem('appearance-loaded')) {
    try {
      const values = JSON.parse(decodeURIComponent(saved.slice(saved.indexOf('=')+1)))
      for (const key of keys) if (typeof values[key]==='string') localStorage.setItem(key,values[key])
      sessionStorage.setItem('appearance-loaded','yes')
    } catch { /* Use defaults for an unreadable preference. */ }
  }
}
document.documentElement.dataset.accent=localStorage.getItem('dp-accent')||'relay'
for (let i=0;i<3;i++) document.documentElement.classList.toggle('display-'+i,localStorage.getItem('dp-display-'+i)==='1')
if (bridge?.saveAppearance) {
  let previous=''
  const observer = new MutationObserver(()=>{
    const values=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)||'']))
    const current=JSON.stringify(values)
    if(current!==previous){previous=current;void bridge.saveAppearance!(values).catch(()=>{})}
  })
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-preference','data-accent','data-rail']})
}

