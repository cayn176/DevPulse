const element = id => document.getElementById(id)
const history = []
let pendingInstall
let generation = 0
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  pendingInstall = event
  element('install').hidden = false
})
element('install').onclick = async () => {
  if (!pendingInstall) return
  const prompt = pendingInstall
  pendingInstall = null
  element('install').hidden = true
  await prompt.prompt()
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{})
function add(role, text) {
  const item = document.createElement('article')
  const name = document.createElement('strong')
  const body = document.createElement('p')
  name.textContent = role === 'assistant' ? 'DevPulse AI' : 'Tu'
  body.textContent = text
  item.append(name, body)
  element('history').append(item)
  history.push({role,text})
}
element('forget').onclick = () => {
  generation++
  history.length = 0
  element('identity').value = ''
  element('question').value = ''
  element('history').replaceChildren()
  element('status').textContent = 'Account scollegato e chat cancellata da questa scheda.'
}
element('chat').onsubmit = async event => {
  event.preventDefault()
  const key = element('identity').value.trim()
  const text = element('question').value.trim()
  const seq = generation
  if (!key) { element('status').textContent = 'Collega il tuo account GitHub per inviare il messaggio.'; element('identity').focus(); return }
  if (!text || element('send').disabled) return
  element('send').disabled = true
  element('status').textContent = 'Attendo la risposta…'
  try {
    const prompt = JSON.stringify({request:text,history:history.slice(-6).map(m=>({...m,text:m.text.slice(0,3000)}))})
    const result = await fetch('/api/chat',{method:'POST',cache:'no-store',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({prompt})})
    const data = await result.json()
    if (seq !== generation) return
    if (!result.ok) throw Error(data.detail || 'Invio non riuscito.')
    let reply = data.text
    try { const parsed = JSON.parse(reply); if (typeof parsed.reply==='string') reply = parsed.reply } catch {}
    add('user', text)
    add('assistant', reply)
    element('question').value = ''
    element('status').textContent = ''
  } catch (error) { if (seq===generation) element('status').textContent = error.message || 'Connessione non riuscita.' }
  finally { element('send').disabled = false }
}
