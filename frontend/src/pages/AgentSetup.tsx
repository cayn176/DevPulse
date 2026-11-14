import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Panel } from '../components/Primitives'
import { runtime } from '../lib/runtime'

const agents = {
  codex: {
    name: 'OpenAI Codex', install: 'Installa Codex CLI per Windows seguendo la guida ufficiale. Poi apri una nuova finestra di PowerShell. Se il comando è già disponibile puoi passare direttamente all’accesso.',
    url: 'https://developers.openai.com/codex/cli/', check: 'codex --version', login: 'codex login',
    auth: 'Esegui il comando di accesso e completa l’autenticazione OpenAI nel browser. Se hai già collegato il tuo account alla CLI, passa alla verifica.',
    trouble: 'Se PowerShell non trova codex, termina l’installazione della CLI, riapri PowerShell e riavvia DevPulse. Se non compare un account, ripeti il login nel terminale Windows dello stesso utente.'
  },
  claude: {
    name: 'Claude Agent', install: 'La versione desktop include il Claude Agent SDK. Prepara una chiave API Anthropic con credito disponibile e l’ID di un modello a cui il tuo account ha accesso.',
    url: 'https://platform.claude.com/settings/keys', check: '', login: '',
    auth: 'Apri le impostazioni Anthropic qui sotto. Inserisci la chiave e il Model ID, premi Save credential e torna a questa guida. La chiave viene cifrata nel backend locale.',
    trouble: 'Se la verifica viene rifiutata, controlla credito, permessi e modello nella console Anthropic. L’accesso alla chat Claude nel browser e l’accesso API si configurano separatamente.'
  },
  cursor: {
    name: 'Cursor Agent', install: 'Segui la sezione Windows (native) della guida Cursor CLI. Apri una nuova finestra di PowerShell e verifica che il comando agent sia disponibile nello stesso Windows in cui gira DevPulse.',
    url: 'https://cursor.com/docs/cli/installation', check: 'agent --version', login: 'agent login',
    auth: 'Accedi con il tuo account Cursor da PowerShell. Dopo la conferma del browser torna qui. DevPulse avvia il comando agent acp per collegarsi.',
    trouble: 'Se è installato solo l’editor, installa anche la CLI Windows. Se agent acp non è riconosciuto, aggiorna la CLI e riavvia DevPulse.'
  }
}
type Agent = keyof typeof agents

export function AgentSetup() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('agent')
  const id: Agent = requested === 'claude' || requested === 'cursor' ? requested : 'codex'
  const agent = agents[id]
  return <Panel className="native-card agent-setup">
    <h2>Collega un agente AI</h2>
    <nav aria-label="Guide per agente" className="quick-links">{(Object.keys(agents) as Agent[]).map(key =>
      <Button key={key} variant={key === id ? 'primary' : 'secondary'} aria-pressed={key === id} onClick={() => setParams({agent:key})}>{agents[key].name}</Button>
    )}</nav>
    <SetupSteps key={id} id={id} agent={agent}/>
  </Panel>
}
function SetupSteps({id, agent}: {id: Agent; agent: typeof agents[Agent]}) {
  const preview = import.meta.env.MODE === 'preview'
  const cache = useQueryClient()
  const states = useQuery({queryKey:['runtime-providers'],queryFn:runtime.providers,enabled:!preview,retry:false})
  const connection = states.data?.find(p => p.id === id)
  const verify = useMutation({mutationFn:()=>runtime.connect(id), onSettled:()=>cache.invalidateQueries({queryKey:['runtime-providers']})})
  const [copied, setCopied] = useState('')
  const [copyFailed,setCopyFailed] = useState(false)
  function command(value:string) {
    return <div className="setup-command"><code>{value}</code><button type="button" onClick={async()=>{
      try { await navigator.clipboard.writeText(value); setCopied(value); setCopyFailed(false) }
      catch { setCopyFailed(true) }
    }}>{copied===value?'Copiato':'Copia'}</button></div>
  }
  return <section aria-label={'Configurazione '+agent.name}>
    <ol className="setup-steps">
      <li><h3>Prepara {agent.name}</h3><p>{agent.install}</p><a href={agent.url} target="_blank" rel="noreferrer">{id==='claude'?'Apri la console Anthropic':'Apri la guida di installazione'} ↗</a>{agent.check&&command(agent.check)}</li>
      <li><h3>Collega il tuo account</h3><p>{agent.auth}</p>{agent.login?command(agent.login):<Link to="/app/providers?provider=anthropic">Apri le impostazioni Anthropic →</Link>}</li>
      <li><h3>Verifica in DevPulse</h3>{preview?<p>La preview mostra i passaggi. Apri DevPulse sul tuo PC per verificare il collegamento con la CLI o con il tuo account.</p>:<><p>La verifica controlla il runtime e l’accesso all’account sul tuo computer.</p><Button loading={verify.isPending} onClick={()=>verify.mutate()}>Verifica {agent.name}</Button>
      {connection?.status==='connected'&&<p role="status">Collegato · {connection.models?.length||0} modelli rilevati</p>}
      {(verify.error||states.error)&&<p role="alert">{(verify.error||states.error)?.message}</p>}
      {verify.isSuccess&&connection?.status!=='connected'&&<p role="status">Accesso da completare. Esegui il passaggio 2 e ripeti la verifica.</p>}</>}</li>
      <li><h3>Avvia la prima chat</h3><p>Apri una cartella in Projects. Poi scegli il progetto in Conversations, premi New conversation e scrivi il primo messaggio.</p><div className="quick-links"><Link to="/app/projects">Apri Projects →</Link><Link to={'/app/conversations?agent='+id}>Conversa con {agent.name} →</Link></div></li>
    </ol>
    {copyFailed&&<p role="status">Seleziona il comando e copialo manualmente.</p>}
    <details><summary>Il collegamento non riesce?</summary><p>{agent.trouble}</p></details>
  </section>
}
