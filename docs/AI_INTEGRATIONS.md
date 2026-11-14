# DevPulse AI and agent connections

The Windows app opens a personal workspace with a local account. For development in a browser, run `./start.ps1` and open `http://127.0.0.1:5173/connect`.

## DevPulse AI hosted service

In the desktop app, link GitHub, open DevPulse AI and send your first message. The hosted service validates the GitHub access token against GitHub on each turn. Only the selected prompt, recent conversation and attached context are forwarded to OpenAI. The owner’s OpenAI key and the Blob credential are read only by the Vercel function. Usage counters are keyed by numeric account ID and UTC date. The shared service allows 12 requests per account and 100 in total per UTC day. Set the provider project budget and billing limits separately.

Hosting the cloud directory requires Vercel, a private Blob store and production variables OPENAI_API_KEY and OPENAI_MODEL. Set OPENAI_API_KEY as Sensitive in Vercel. When rotating it, update the variable and redeploy. HTTP 402 indicates a provider billing or quota problem. HTTP 429 indicates an application or provider rate limit.

## Other assistant modes

Choose **Workspace tools** for supported requests in English or Italian, including “Mostrami i miei progetti”, “Show Git status”, “Show failed deployments” or “Crea un'issue: Correggere la build”. These commands run without model credits. Select a registered project to restrict Git queries. Select a repository when starting a conversation to inspect its open issues and pull requests. An issue draft displays its repository, title and body before you confirm publication.

Choose **OpenAI API** or **Claude API** for free-form requests and code proposals. Configure an API key and a model available to that API account in Integration Manager. Provider pricing applies. The assistant can use the same workspace tools. Their results stay in DevPulse and are excluded from subsequent external chat history. Repository chat sends the selected repository's file names, the files you attach and recent ordinary chat messages to the selected model.

Choose **Ollama** to use an installed local model. Start Ollama on this computer and download your preferred model. DevPulse queries `http://127.0.0.1:11434/api/tags` and offers the local models the service reports. Refresh after downloading. Ollama runs independently of the DevPulse installer. [Ollama model discovery](https://docs.ollama.com/api/tags) · [Ollama chat](https://docs.ollama.com/api/chat)

For a code change, attach existing file paths and inspect the proposed diff. Confirm **Create branch and draft PR** to publish. DevPulse verifies the base commit, creates a separate branch and opens a draft pull request. Use **Create repository** to initialize a remote repository with a README. Cursor Cloud tasks require a separate provider key and confirmation to run on a GitHub branch.

## Native agent sessions

In **Agents**, verify the provider before opening a conversation. Open a local project to import supported session history or create a session. Models, usage and account details appear when returned by the runtime.

- **Codex** requires the official Codex CLI on PATH. Verify the connection, use official sign-in if needed, then verify again. Thread history comes from Codex App Server. [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- **Claude Agent** uses the Anthropic Agent SDK with an Anthropic API key. Save that credential under Claude API before verification. The SDK lists supported sessions for the selected project. [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- **Cursor Agent** requires the Cursor CLI and its authentication. Session loading, modes and models follow the runtime's ACP capabilities. Cursor Cloud and Cursor Agent use separate connections. [Cursor ACP](https://cursor.com/docs/cli/acp) · [Cursor Cloud Agent API](https://cursor.com/docs/cloud-agent/api/endpoints)

## GitHub

The Connect screen supports a fine-grained personal access token restricted to selected repositories. Metadata read supports repository discovery. For draft pull requests grant Contents and Pull requests write. For creating issues grant Issues write. For creating repositories the token needs Administration write. GitHub account permissions and organization policies also apply.

DevPulse lists public and private repositories available to that token. Repository detail shows current branches, commits, README, pull requests and issues. **Clone locally** creates a Git working tree and uses a scoped, temporary authentication header. DevPulse omits this header from the remote URL and stored Git config. [GitHub repository API](https://docs.github.com/en/rest/repos/repos)

For OAuth in the browser build, register the exact callback shown on Connect and configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the backend. Restart the service. OAuth availability is shown from the current server configuration.

## Credential storage

Provider key forms submit credentials directly to the backend. Saved connections return status and model metadata. The desktop backend encrypts keys and stores its encryption material using Windows account protection. The source build reads protected settings from the backend environment. Keep private application keys on a server you control when distributing binaries to other people. A packaged backend runs on the recipient's machine.

For a server-owned API credential, configure `SERVER_AI_GITHUB_LOGIN` and the matching provider key and model in `backend/.env`. The supported names are `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `CURSOR_API_KEY`. Remove a saved user connection in Integration Manager and revoke a compromised credential in the provider's account dashboard.

## Verification

The isolated backend suite exercises provider request shapes, key redaction and encryption, owner isolation, tool requests, issue confirmation, Ollama discovery and inference, GitHub repository listing, stale commits and draft PR retries. Live inference, account entitlements and remote writes require authorized accounts.
