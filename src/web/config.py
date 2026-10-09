"""Configuration settings for F1 Synapse Web API."""

import os
from pathlib import Path
from pydantic import BaseModel
from src.lib.settings import get_settings


class WebConfig(BaseModel):
    host: str = os.environ.get("F1_WEB_HOST", "127.0.0.1")
    port: int = int(os.environ.get("F1_WEB_PORT", 8000))
    computed_data_dir: Path = Path(get_settings().computed_data_location)
    web_data_dir: Path = Path(get_settings().computed_data_location) / "web"
    fastf1_cache_dir: Path = Path(get_settings().cache_location)
    allowed_hosts: list[str] = ["127.0.0.1", "localhost", "testclient", "testserver"]
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]


config = WebConfig()
