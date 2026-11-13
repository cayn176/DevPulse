# Sicurezza e dati locali

DevPulse desktop avvia l’API su una porta casuale di loopback. Electron apre la sessione con un nonce temporaneo. Le richieste che modificano dati controllano l’origine. La finestra usa sandbox, isolamento del contesto e IPC con operazioni predefinite.

Il backend cifra le chiavi dei provider e i token GitHub con Fernet. Electron protegge la chiave di cifratura con il servizio di protezione del sistema operativo. L’API restituisce informazioni di stato e non rimanda le chiavi salvate al renderer. Se gestisci una chiave comune per più persone, configurala esclusivamente su un backend che controlli: distribuire una chiave nel software installato su altri PC non la rende segreta.

Le cartelle e le sessioni sono associate al proprietario del workspace. La cronologia, i messaggi, il contenuto dei file e i log possono contenere informazioni riservate. I file di configurazione, i database di sviluppo, le credenziali e la cronologia locale sono esclusi dal repository e dall’installer.

L’app richiede la revisione delle azioni di pubblicazione. Disconnettere un’integrazione rimuove l’accesso locale; per revocare un token presso il servizio, usa anche le impostazioni del provider.

Il bootstrap Windows usa HTTPS e un hash SHA-512 incorporato per verificare il pacchetto prima dell’esecuzione. Gli hash SHA-256 pubblicati nella release consentono la verifica manuale. Questa versione non ha un certificato Authenticode.
