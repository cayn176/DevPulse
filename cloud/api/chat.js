import { get, put } from '@vercel/blob'

const DAY_PER_ACCOUNT = 12
const DAY_TOTAL = 100
const MAX_PROMPT = 48000

// One counter per UTC day. Conditional writes prevent concurrent overspending.
async function reserve(account) {
  const key = 'managed-ai/usage-' + new Date().toISOString().slice(0,10) + '.json'
  for (let attempt=0; attempt<5; attempt++) {
    const old = await get(key, {access:'private',useCache:false})
    const counts = old ? await new Response(old.stream).json() : {total:0, users:{}}
    if (counts.total >= DAY_TOTAL || (counts.users[account]||0) >= DAY_PER_ACCOUNT) return false
    counts.total++
    counts.users[account] = (counts.users[account]||0)+1
    try {
      await put(key, JSON.stringify(counts), {access:'private',addRandomSuffix:false,allowOverwrite:!!old,...(old?{ifMatch:old.blob.etag}:{})})
      return true
    } catch (error) {
      if (error.name !== 'BlobPreconditionFailedError' && !/already exists/i.test(error.message)) throw error
    }
  }
  return false
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','private, no-store')
  const fail = (status,detail) => res.status(status).json({detail})
  const ready = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL && process.env.BLOB_READ_WRITE_TOKEN)
  if (req.method === 'GET') return res.json({available:ready})
  if (req.method !== 'POST') return fail(405,'Use POST.')
  if (!ready) return fail(503,'Il gestore deve attivare DevPulse AI sul server.')
  if (!req.headers['content-type']?.startsWith('application/json')) return fail(415,'JSON required.')
  const token = req.headers.authorization
  if (typeof token !== 'string' || !/^Bearer [^\s]{10,1000}$/.test(token)) return fail(401,'Collega GitHub in DevPulse.')
  const prompt = req.body?.prompt
  if (typeof prompt!=='string' || !prompt.trim() || prompt.length>MAX_PROMPT) return fail(422,'Riduci il contesto allegato alla conversazione.')
  try {
    const profile = await fetch('https://api.github.com/user',{headers:{Authorization:token,Accept:'application/vnd.github+json','User-Agent':'DevPulse-AI'},signal:AbortSignal.timeout(8000),redirect:'error'})
    if (!profile.ok) return fail(profile.status===401?401:503,'Verifica il collegamento a GitHub e riprova.')
    const {id}=await profile.json()
    if (!Number.isSafeInteger(id)||id<=0) return fail(401,'Account GitHub non valido.')
    if (!await reserve(String(id))) return fail(429,'Limite giornaliero di DevPulse AI raggiunto. Riprova domani.')
    const reply=await fetch('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:process.env.OPENAI_MODEL,store:false,max_output_tokens:2200,instructions:INSTRUCTIONS,input:prompt})})
    if (!reply.ok) {
      const issue = await reply.json().catch(()=>({}))
      const code = String(issue.error?.code || '')
      const type = String(issue.error?.type || '')
      const safeTag = value => /^[a-z_]{1,45}$/.test(value) ? value : 'unspecified'
      console.warn('OpenAI response', reply.status, safeTag(code), safeTag(type))
      const quota = /quota|billing|credit/i.test(code+' '+type+' '+(issue.error?.message||'')) && !/tokens per min|requests per min/i.test(issue.error?.message||'')
      if (quota)
        return fail(402,'Il credito del progetto OpenAI è esaurito o la fatturazione non è attiva.')
      if (reply.status === 429) return fail(429,'OpenAI ha raggiunto il limite temporaneo di richieste. Riprova più tardi.')
      return fail(502,'Verifica le credenziali e l’accesso al modello OpenAI sul server.')
    }
    const data=await reply.json()
    const text=(data.output||[]).flatMap(item=>item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n')
    if (!text) return fail(502,'Il provider ha restituito una risposta vuota.')
    return res.json({text})
  } catch { return fail(503,'Il servizio DevPulse AI non è raggiungibile. Riprova tra poco.') }
}
import { INSTRUCTIONS } from '../instructions.js'

