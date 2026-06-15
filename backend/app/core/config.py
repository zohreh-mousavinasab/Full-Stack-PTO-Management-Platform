from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "PTO Tracker API"
    api_v1_prefix: str = ""
    database_url: str = Field(
        default="sqlite:///./pto_tracker.db",
        alias="DATABASE_URL",
    )
    secret_key: str = Field(
        default="change-me-in-production",
        alias="SECRET_KEY",
    )
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8
    frontend_origin: str = Field(
        default="http://localhost:5173",
        alias="FRONTEND_ORIGIN",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

