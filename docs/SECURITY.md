# Sicurezza e dati locali

DevPulse desktop avvia l’API su una porta casuale di loopback. Electron apre la sessione con un nonce temporaneo. Le richieste che modificano dati controllano l’origine. La finestra usa sandbox, isolamento del contesto e IPC con operazioni predefinite.

Il backend cifra le chiavi dei provider e i token GitHub con Fernet. Electron protegge la chiave di cifratura con il servizio di protezione del sistema operativo. L’API restituisce informazioni di stato e non rimanda le chiavi salvate al renderer. Se gestisci una chiave comune per più persone, configurala esclusivamente su un backend che controlli: distribuire una chiave nel software installato su altri PC non la rende segreta.

Le cartelle e le sessioni sono associate al proprietario del workspace. La cronologia, i messaggi, il contenuto dei file e i log possono contenere informazioni riservate. I file di configurazione, i database di sviluppo, le credenziali e la cronologia locale sono esclusi dal repository e dall’installer.

L’app richiede la revisione delle azioni di pubblicazione. Disconnettere un’integrazione rimuove l’accesso locale; per revocare un token presso il servizio, usa anche le impostazioni del provider.

Il bootstrap Windows usa HTTPS e un hash SHA-512 incorporato per verificare il pacchetto prima dell’esecuzione. Gli hash SHA-256 pubblicati nella release consentono la verifica manuale. Questa versione non ha un certificato Authenticode.

## Servizio AI gestito

La funzione Vercel legge la chiave OpenAI dai segreti di produzione. L’app desktop invia il token dell’utente al solo endpoint HTTPS del servizio, che lo verifica con GitHub. La chat web conserva il token solo nel campo di input finché la scheda resta aperta. Il service worker memorizza soltanto risorse statiche. Il servizio invia a OpenAI il contesto della richiesta con store disabilitato e salva nel Blob privato i contatori giornalieri per ID GitHub. La chiave del gestore non viene inviata ai client. Dopo la rotazione di un segreto Vercel occorre ridistribuire il servizio.
