<p align="center"><img src="frontend/public/brand/tile.svg" width="72" alt="DevPulse"></p>

# DevPulse

**Un workspace desktop per lavorare con progetti locali, agenti AI, GitHub e deployment.** DevPulse 0.3.1 è disponibile per Windows x64. Il backend gira sul PC e conserva le credenziali dei provider cifrate. Puoi iniziare con una cartella locale senza configurare un account.

[Scarica l’installer Windows](https://github.com/cayn176/DevPulse/releases/download/v0.3.1/DevPulse-Setup-0.3.1-x64.exe) · [Pacchetto offline](https://github.com/cayn176/DevPulse/releases/download/v0.3.1/DevPulse-Offline-0.3.1-x64.exe) · [Versione portatile ZIP](https://github.com/cayn176/DevPulse/releases/download/v0.3.1/DevPulse-Portable-0.3.1-x64.zip) · [Release e checksum](https://github.com/cayn176/DevPulse/releases/tag/v0.3.1) · [Preview privata nel browser](https://devpulse-workspace-preview.leafyshark257.chatgpt.site)

## Usare DevPulse dal browser

Apri [DevPulse AI Web](https://devpulse-ai-cayn176.vercel.app/) per la chat. Dal menu di Edge o Chrome puoi installarla come app web. Le guide e le schermate del workspace sono nella preview; l’accesso al filesystem e alle CLI locali richiede DevPulse Desktop.

## Installazione

1. Scarica **DevPulse-Setup-0.3.1-x64.exe** dalla release e aprilo.
2. Il programma scarica da GitHub il pacchetto della versione 0.3.1 e controlla il suo hash SHA-512. In caso di errore interrompe l’installazione.
3. Si apre la procedura di installazione per il tuo utente Windows. Scegli la cartella di destinazione, completa l’installazione e avvia DevPulse dal menu Start.
4. Per installare senza Internet, copia sul PC **DevPulse-Offline-0.3.1-x64.exe** ed eseguilo direttamente. I due percorsi installano la stessa applicazione.
5. Per usare la versione portatile, estrai interamente **DevPulse-Portable-0.3.1-x64.zip** in una cartella dell’utente e apri **DevPulse.exe** nella cartella estratta. Il profilo e i progetti seguono le stesse regole della versione installata.

Gli eseguibili di questa release sono privi di firma Authenticode. Un criterio aziendale o Windows Application Control può impedire l’esecuzione di file senza un editore attendibile. Per verificare il download con PowerShell usa `Get-FileHash .\DevPulse-Setup-0.3.1-x64.exe -Algorithm SHA256` e confronta il risultato con `SHA256SUMS.txt` allegato alla release.

## Il workspace

| Area | Cosa puoi fare |
|---|---|
| Progetti e codice | Aprire o clonare una cartella, cercare e modificare file in Monaco, esaminare differenze e aprire il progetto in VS Code. |
| Agenti e conversazioni | Collegare Codex App Server, Claude Agent SDK e Cursor ACP, selezionare un modello disponibile e gestire sessioni, streaming e approvazioni. |
| DevPulse AI | Interrogare il workspace, usare Ollama locale o provider API, esaminare proposte di modifica e confermare la pubblicazione su GitHub. |
| Git e repository | Controllare modifiche, commit e branch, isolare progetti in worktree e consultare pull request, issue e GitHub Actions. |
| Tasks e Automation | Organizzare il lavoro per stato, priorità, scadenza e progetto, leggere lo storico e avviare workflow locali con conferma. |
| Deployment | Collegare Vercel per consultare build, log e metadati degli ambienti e confermare deploy o redeploy. |
| Interfaccia | Usare la ricerca rapida con Ctrl+K, comprimere la sidebar e scegliere tema chiaro, scuro o di sistema, accento, densità e movimento. |

La preview nel browser contiene un workspace di esempio isolato. Mostra le schermate e permette di provare operazioni locali nel browser. L’app desktop usa i file, i runtime e i permessi concessi dall’utente.

## Primo messaggio e agenti

Nell’app desktop collega GitHub, apri **DevPulse AI** e scrivi il primo messaggio. La chiave OpenAI del servizio è custodita nel progetto Vercel del gestore. Il servizio verifica il token GitHub con GitHub e invia il messaggio, la cronologia recente e l’eventuale contesto allegato a OpenAI. Il gestore deve mantenere attiva la fatturazione del progetto OpenAI.

In **Integration guides** scegli Codex, Claude Agent o Cursor. Segui i quattro passaggi e usa **Verifica** prima di aprire la conversazione. Le guide sono consultabili anche nella [preview](https://devpulse-workspace-preview.leafyshark257.chatgpt.site/#/app/guides?agent=codex).

## Configurare gli strumenti

- Installa **Git per Windows** per usare clone, commit, branch e worktree. In **Projects** apri una cartella o crea un progetto.
- In **Integration Manager** collega GitHub con un token fine-grained limitato alle repository necessarie oppure con il flusso dispositivo e il client ID pubblico della tua OAuth App abilitata. Per il server web è disponibile OAuth con callback e PKCE.
- In **Agents** verifica i CLI di Codex e Cursor installati sul PC. Il Claude Agent SDK richiede una chiave API Anthropic. Modelli, informazioni account e cronologie dipendono da ciò che espone ciascun runtime.
- Per i deployment collega un token Vercel con accesso al team e al progetto. L’app mostra l’anteprima dell’operazione prima della pubblicazione.

[Guida ai provider e sincronizzazione](docs/AI_INTEGRATIONS.md) · [Come sono protetti i dati](docs/SECURITY.md)

## Avviare dai sorgenti

Richiede Node.js 24, npm, Git e Python 3.13. Su Windows, dalla cartella del progetto:

```powershell
py -3.13 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-desktop.txt
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run build:frontend
npm.cmd run desktop:dev
```

Per lo sviluppo web esegui `.\start.ps1` e apri `http://127.0.0.1:5173/connect`. I valori privati si configurano in `backend/.env` oppure nelle integrazioni dell’app.

## Verifiche e release

```powershell
Push-Location backend
.venv/Scripts/python.exe -m pytest
Pop-Location
npm.cmd --prefix frontend run lint
npm.cmd run test:desktop
npm.cmd run desktop:dev -- --smoke-test
npm.cmd run build:desktop
```

La build produce entrambi gli installer e `SHA256SUMS.txt` nella cartella `release`. Per aggiungere lo ZIP portatile allo stesso manifesto esegui `backend/.venv/Scripts/python.exe scripts/portable.py` dopo la build. Il bootstrap incorpora l’URL della versione e l’hash del pacchetto offline. Quando si pubblica una nuova versione, entrambi i file devono provenire dalla stessa build.

## Pubblicazione Windows con editore verificato

Per il Microsoft Store usa i tre valori di Product identity ottenuti dopo aver riservato il nome dell’app in Partner Center. Imposta `DEVPULSE_STORE_NAME`, `DEVPULSE_STORE_PUBLISHER` e `DEVPULSE_STORE_DISPLAY_NAME`, poi esegui `npm run pack:desktop` e `npm run build:store`. Carica il file APPX in Partner Center per la certificazione e la firma Microsoft.

Per la distribuzione diretta su GitHub, usa un certificato Authenticode riconosciuto in CurrentUser/My. Imposta `DEVPULSE_REQUIRE_SIGNING=1`, `DEVPULSE_SIGN_CERT_SHA1` e il percorso Windows SDK `DEVPULSE_SIGNTOOL`. La build firma e verifica applicazione, disinstallatore e installer prima dei checksum. L’avviso reputazionale per un nuovo download può comparire anche con un certificato valido.

## Tecnologie

React e TypeScript, Vite, Monaco Editor, Electron, FastAPI, SQLAlchemy, SQLite e Alembic. La distribuzione include l’eseguibile Python ufficiale firmato, la libreria standard e le dipendenze dell’API. NSIS gestisce il download verificato e l’installazione. I sorgenti del marchio, le versioni monocromatiche e il logo orizzontale si trovano in [frontend/public/brand](frontend/public/brand).
