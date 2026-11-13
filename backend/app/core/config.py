from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr


class Settings(BaseSettings):
    devpulse_desktop: bool = False
    desktop_session_nonce: SecretStr = SecretStr("")
    devpulse_frontend_dist: str = ""
    devpulse_data_dir: str = ""
    ollama_model: str = ""
    app_env: str = "development"
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://127.0.0.1:5173/auth/github/callback"
    frontend_origin: str = "http://127.0.0.1:5173"
    local_agent_github_login: str = ""
    server_ai_github_login: str = ""
    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = ""
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = ""
    cursor_api_key: SecretStr = SecretStr("")
    token_encryption_key: str = ""
    database_url: str = "sqlite:///./devpulse.db"
    cookie_secure: bool = False
    session_ttl_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
