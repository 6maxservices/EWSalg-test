"""Environment-backed gateway configuration."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class RouteConfig:
    """Configuration for one logical model route."""

    name: str
    provider: str
    base_url: str
    api_key: str
    upstream_model: str
    public: bool
    input_cost_per_million: float = 0.0


@dataclass(frozen=True)
class GatewayConfig:
    """All gateway settings required at runtime."""

    host: str
    port: int
    proxy_api_key: str
    allowed_origins: frozenset[str]
    blocklist_path: Path
    aliases_path: Path
    query_log_path: Path
    complexity_char_threshold: int
    max_request_bytes: int
    routes: dict[str, RouteConfig]

    @classmethod
    def from_env(cls, project_root: Path | None = None) -> "GatewayConfig":
        """Build configuration without reading or logging secret values."""

        root = (project_root or Path.cwd()).resolve()

        def env_path(name: str, default: str) -> Path:
            raw = os.getenv(name, default)
            path = Path(raw)
            return path if path.is_absolute() else root / path

        routes = {
            "private-fast": RouteConfig(
                name="private-fast",
                provider="runpod",
                base_url=os.getenv("RUNPOD_TIER1_URL", ""),
                api_key=os.getenv("RUNPOD_API_KEY", ""),
                upstream_model=os.getenv("RUNPOD_TIER1_MODEL", ""),
                public=False,
                input_cost_per_million=float(os.getenv("RUNPOD_TIER1_INPUT_COST_PER_MILLION", "0")),
            ),
            "private-core": RouteConfig(
                name="private-core",
                provider="runpod",
                base_url=os.getenv("RUNPOD_TIER2_URL", ""),
                api_key=os.getenv("RUNPOD_API_KEY", ""),
                upstream_model=os.getenv("RUNPOD_TIER2_MODEL", ""),
                public=False,
                input_cost_per_million=float(os.getenv("RUNPOD_TIER2_INPUT_COST_PER_MILLION", "0")),
            ),
            "public-gpt": RouteConfig(
                name="public-gpt",
                provider="openai",
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                api_key=os.getenv("OPENAI_API_KEY", ""),
                upstream_model=os.getenv("PUBLIC_GPT_MODEL", ""),
                public=True,
                input_cost_per_million=float(os.getenv("PUBLIC_GPT_INPUT_COST_PER_MILLION", "0")),
            ),
            "public-claude": RouteConfig(
                name="public-claude",
                provider="anthropic",
                base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1"),
                api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                upstream_model=os.getenv("PUBLIC_CLAUDE_MODEL", ""),
                public=True,
                input_cost_per_million=float(os.getenv("PUBLIC_CLAUDE_INPUT_COST_PER_MILLION", "0")),
            ),
        }

        origins = frozenset(
            item.strip()
            for item in os.getenv("PUBLIC_ORIGIN_ALLOWLIST", "sanitizer,manual-approved").split(",")
            if item.strip()
        )

        return cls(
            host=os.getenv("GATEWAY_HOST", "127.0.0.1"),
            port=int(os.getenv("GATEWAY_PORT", "4000")),
            proxy_api_key=os.getenv("PROXY_API_KEY", ""),
            allowed_origins=origins,
            blocklist_path=env_path("DLP_BLOCKLIST_PATH", "config/blocklist.txt"),
            aliases_path=env_path("DLP_ALIASES_PATH", "config/aliases.json"),
            query_log_path=env_path("QUERY_LOG_PATH", "var/query-log.sqlite3"),
            complexity_char_threshold=int(os.getenv("CORE_ROUTE_CHAR_THRESHOLD", "6000")),
            max_request_bytes=int(os.getenv("MAX_REQUEST_BYTES", "1048576")),
            routes=routes,
        )
