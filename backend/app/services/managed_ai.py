"""The installer contains only the public endpoint of the DevPulse service."""
import httpx
from fastapi import HTTPException

from app.services.ai import parse_reply

ENDPOINT = "https://devpulse-ai-cayn176.vercel.app/api/chat"


async def managed_answer(github_token: str, prompt: str):
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            response = await client.post(ENDPOINT, headers={"Authorization": "Bearer " + github_token},
                                         json={"prompt": prompt})
    except httpx.RequestError as exc:
        raise HTTPException(503, "DevPulse AI non è raggiungibile. Riprova tra poco.") from exc
    errors = {401: "Ricollega GitHub per usare DevPulse AI.",
              402: "Il gestore deve verificare il credito e la fatturazione del progetto OpenAI.",
              422: "Riduci il testo o i file allegati a questo messaggio.",
              429: "Limite di utilizzo raggiunto. Riprova più tardi.",
              502: "Il provider AI ha rifiutato la richiesta. Il gestore deve controllare modello e credito.",
              503: "DevPulse AI è temporaneamente indisponibile."}
    if response.status_code != 200:
        raise HTTPException(response.status_code if response.status_code in errors else 502,
                            errors.get(response.status_code, "Risposta inattesa dal servizio DevPulse AI."))
    try:
        raw = response.json()["text"]
        if not isinstance(raw, str) or not raw:
            raise ValueError()
        return parse_reply(raw)
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(502, "Risposta non valida dal servizio DevPulse AI.") from exc

