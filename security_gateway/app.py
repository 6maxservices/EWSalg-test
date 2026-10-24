"""Pure gateway request handling, separate from the HTTP server."""

from __future__ import annotations

from dataclasses import dataclass
import hmac
from typing import Any, Callable

from .config import GatewayConfig, RouteConfig
from .policy import DlpPolicy, PolicyError, collect_text
from .providers import ProviderClient, UpstreamError
from .query_log import QueryEvent, QueryLog


@dataclass(frozen=True)
class GatewayResponse:
    status: int
    payload: dict[str, Any]


ProviderSender = Callable[[RouteConfig, dict[str, Any]], dict[str, Any]]


class GatewayApplication:
    """OpenAI-compatible routing with default-deny public egress."""

    def __init__(self, config: GatewayConfig, sender: ProviderSender | None = None) -> None:
        self.config = config
        self.policy = DlpPolicy(config.blocklist_path, config.aliases_path)
        self.query_log = QueryLog(config.query_log_path)
        self.sender = sender or ProviderClient().send

    @staticmethod
    def _error(status: int, code: str, message: str) -> GatewayResponse:
        return GatewayResponse(status, {"error": {"code": code, "message": message}})

    def _authenticated(self, headers: dict[str, str]) -> bool:
        if not self.config.proxy_api_key:
            return True
        supplied = headers.get("x-proxy-key", "")
        authorization = headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            supplied = authorization[7:]
        return hmac.compare_digest(supplied, self.config.proxy_api_key)

    def list_models(self, headers: dict[str, str]) -> GatewayResponse:
        if not self._authenticated(headers):
            return self._error(401, "unauthorized", "Invalid local proxy credential")
        names = ["private-auto", *self.config.routes.keys()]
        return GatewayResponse(
            200,
            {"object": "list", "data": [{"id": name, "object": "model"} for name in names]},
        )

    def health(self) -> GatewayResponse:
        configured = {
            name: bool(route.base_url and route.api_key and route.upstream_model)
            for name, route in self.config.routes.items()
        }
        return GatewayResponse(
            200,
            {
                "status": "ok",
                "bind": f"{self.config.host}:{self.config.port}",
                "public_policy_ready": self.config.blocklist_path.is_file(),
                "routes_configured": configured,
            },
        )

    def _select_route(self, requested: str, body: dict[str, Any], headers: dict[str, str]) -> RouteConfig:
        if requested != "private-auto":
            try:
                return self.config.routes[requested]
            except KeyError as exc:
                raise PolicyError("unknown_route", f"Unknown model route: {requested}") from exc

        complexity = headers.get("x-complexity", "").lower()
        metadata = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
        tagged_core = complexity == "core" or str(metadata.get("complexity", "")).lower() == "core"
        prompt_length = len(collect_text(body.get("messages", [])))
        name = "private-core" if tagged_core or prompt_length >= self.config.complexity_char_threshold else "private-fast"
        return self.config.routes[name]

    def chat_completions(self, body: Any, headers: dict[str, str]) -> GatewayResponse:
        normalized_headers = {key.lower(): value for key, value in headers.items()}
        if not self._authenticated(normalized_headers):
            return self._error(401, "unauthorized", "Invalid local proxy credential")
        if not isinstance(body, dict) or not isinstance(body.get("messages"), list):
            return self._error(400, "invalid_request", "messages must be a JSON array")
        messages = body["messages"]
        if any(
            not isinstance(message, dict)
            or message.get("role") not in {"system", "user", "assistant", "tool"}
            or not isinstance(message.get("content"), (str, list))
            for message in messages
        ):
            return self._error(400, "invalid_request", "each message requires a supported role and text/content array")

        prompt_text = collect_text(messages)
        requested = str(body.get("model", "private-auto"))
        origin = normalized_headers.get("x-origin", "")
        route_name = requested
        provider = "unknown"
        origin_result = "not-required"
        dlp_result = "not-required"
        estimated_cost_usd = 0.0
        status = 500
        outcome = "internal-error"

        try:
            route = self._select_route(requested, body, normalized_headers)
            route_name = route.name
            provider = route.provider
            estimated_tokens = max(1, (len(prompt_text) + 3) // 4)
            estimated_cost_usd = estimated_tokens * max(0.0, route.input_cost_per_million) / 1_000_000
            outgoing = dict(body)
            outgoing["model"] = route.name

            if route.public:
                if origin not in self.config.allowed_origins:
                    origin_result = "block"
                    raise PolicyError("origin_block", "Public route requires an allowlisted X-Origin header")
                origin_result = "pass"
                outgoing = self.policy.prepare_public_payload(outgoing)
                dlp_result = "pass"

            try:
                self.query_log.append(
                    QueryEvent(
                        route=route_name,
                        provider=provider,
                        origin=origin or "none",
                        prompt_text=prompt_text,
                        estimated_cost_usd=estimated_cost_usd,
                        origin_result=origin_result,
                        dlp_result=dlp_result,
                        outcome="preflight",
                        http_status=0,
                    )
                )
            except Exception as exc:
                raise PolicyError(
                    "query_log_unavailable",
                    "Route disabled because the local audit log is unavailable",
                ) from exc

            response = self.sender(route, outgoing)
            if route.public:
                response = self.policy.restore_public_response(response)
            status = 200
            outcome = "pass"
            return GatewayResponse(status, response)
        except PolicyError as exc:
            status = 403 if exc.code in {"origin_block", "dlp_block"} else 503 if exc.code in {"blocklist_missing", "query_log_unavailable"} else 400
            outcome = exc.code
            if exc.code == "dlp_block":
                dlp_result = "block"
            return self._error(status, exc.code, str(exc))
        except UpstreamError as exc:
            status = exc.status
            outcome = "upstream-error"
            return self._error(status, "upstream_error", str(exc))
        except Exception:
            status = 500
            outcome = "internal-error"
            return self._error(500, "internal_error", "Gateway request failed")
        finally:
            try:
                self.query_log.append(
                    QueryEvent(
                        route=route_name,
                        provider=provider,
                        origin=origin or "none",
                        prompt_text=prompt_text,
                        estimated_cost_usd=estimated_cost_usd,
                        origin_result=origin_result,
                        dlp_result=dlp_result,
                        outcome=outcome,
                        http_status=status,
                    )
                )
            except Exception:
                # Successful egress already has a durable preflight record. A
                # final-log failure must not expose request/response bodies.
                pass
