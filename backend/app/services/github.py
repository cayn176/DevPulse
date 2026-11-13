import asyncio
from typing import Any

import httpx

API_BASE = "https://api.github.com"
API_VERSION = "2026-03-10"


class GitHubAPIError(Exception):
    def __init__(self, status_code: int, message: str, retry_after: int | None = None):
        self.status_code = status_code
        self.message = message
        self.retry_after = retry_after
        super().__init__(message)


class GitHubClient:
    def __init__(self, token: str | None = None):
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "DevPulse/0.1",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.client = httpx.AsyncClient(base_url=API_BASE, headers=headers, timeout=20.0)

    async def close(self) -> None:
        await self.client.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        for attempt in range(3):
            try:
                response = await self.client.get(path, params=params)
            except httpx.RequestError as exc:
                if attempt == 2:
                    raise GitHubAPIError(502, "GitHub could not be reached.") from exc
                await asyncio.sleep(0.25 * (2**attempt))
                continue

            if response.status_code in {502, 503, 504} and attempt < 2:
                await asyncio.sleep(0.25 * (2**attempt))
                continue
            if response.is_error:
                remaining = response.headers.get("X-RateLimit-Remaining")
                reset = response.headers.get("X-RateLimit-Reset")
                retry_after = None
                if remaining == "0" and reset:
                    import time

                    retry_after = max(0, int(reset) - int(time.time()))
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", "60"))
                raise GitHubAPIError(response.status_code, "GitHub rejected the request.", retry_after)
            return response.json()
        raise GitHubAPIError(502, "GitHub could not be reached.")

    async def profile(self) -> dict[str, Any]:
        return await self.get("/user")

    async def public_repositories(self, login: str) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        page = 1
        while True:
            batch = await self.get(
                "/user/repos",
                params={
                    "visibility": "all",
                    "affiliation": "owner,collaborator,organization_member",
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": 100,
                    "page": page,
                },
            )
            if not isinstance(batch, list):
                raise GitHubAPIError(502, "GitHub returned an unexpected repository response.")
            collected.extend(batch)
            if len(batch) < 100:
                return collected
            page += 1

    async def public_events(self, login: str) -> list[dict[str, Any]]:
        result = await self.get(f"/users/{login}/events/public", params={"per_page": 100, "page": 1})
        if not isinstance(result, list):
            raise GitHubAPIError(502, "GitHub returned an unexpected activity response.")
        return result

    async def search_repositories(self, query: str) -> tuple[list[dict[str, Any]], int, int | None]:
        response = await self.client.get(
            "/search/repositories",
            params={"q": query, "sort": "stars", "order": "desc", "per_page": 20},
        )
        remaining = response.headers.get("X-RateLimit-Remaining")
        if response.is_error:
            retry_after = None
            reset = response.headers.get("X-RateLimit-Reset")
            if remaining == "0" and reset:
                import time

                retry_after = max(0, int(reset) - int(time.time()))
            raise GitHubAPIError(response.status_code, "GitHub search is temporarily unavailable.", retry_after)
        data = response.json()
        return data.get("items", []), int(data.get("total_count", 0)), int(remaining) if remaining else None
