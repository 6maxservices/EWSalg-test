"""Provider adapters using only the Python standard library."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Callable
from urllib import error, request
from urllib.parse import urlsplit

from .config import RouteConfig


class UpstreamError(RuntimeError):
    """A bounded provider failure safe to return to a local client."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class HttpResult:
    status: int
    payload: dict[str, Any]


Transport = Callable[[str, dict[str, str], dict[str, Any]], HttpResult]


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        return None


def _default_transport(url: str, headers: dict[str, str], body: dict[str, Any]) -> HttpResult:
    payload = json.dumps(body).encode("utf-8")
    outgoing = request.Request(url=url, data=payload, headers=headers, method="POST")
    try:
        opener = request.build_opener(_NoRedirect())
        with opener.open(outgoing, timeout=180) as response:
            raw = response.read().decode("utf-8")
            return HttpResult(response.status, json.loads(raw))
    except error.HTTPError as exc:
        # Do not reflect the provider body; it can contain submitted content.
        raise UpstreamError(502, f"Provider rejected the request with HTTP {exc.code}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise UpstreamError(502, "Provider request failed") from exc


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _anthropic_messages_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/messages"):
        return base
    if base.endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


def _to_anthropic(body: dict[str, Any], route: RouteConfig) -> dict[str, Any]:
    system_parts: list[str] = []
    messages: list[dict[str, Any]] = []
    for message in body.get("messages", []):
        role = message.get("role")
        content = message.get("content", "")
        if role == "system":
            system_parts.append(content if isinstance(content, str) else json.dumps(content))
        elif role in {"user", "assistant"}:
            messages.append({"role": role, "content": content})

    payload: dict[str, Any] = {
        "model": route.upstream_model,
        "messages": messages,
        "max_tokens": int(body.get("max_tokens", 2048)),
    }
    if system_parts:
        payload["system"] = "\n".join(system_parts)
    for key in ("temperature", "top_p", "stop"):
        if key in body:
            payload[key] = body[key]
    return payload


def _from_anthropic(payload: dict[str, Any], route: RouteConfig) -> dict[str, Any]:
    text = "".join(
        block.get("text", "")
        for block in payload.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text"
    )
    usage = payload.get("usage", {})
    return {
        "id": payload.get("id", "anthropic-local-adapter"),
        "object": "chat.completion",
        "model": route.name,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": payload.get("stop_reason", "stop"),
            }
        ],
        "usage": {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
        },
    }


class ProviderClient:
    """Dispatch logical routes without exposing secrets to logs."""

    def __init__(self, transport: Transport | None = None) -> None:
        self.transport = transport or _default_transport

    def send(self, route: RouteConfig, body: dict[str, Any]) -> dict[str, Any]:
        if body.get("stream"):
            raise UpstreamError(400, "Streaming is not enabled by this local gateway")
        if not route.base_url or not route.api_key or not route.upstream_model:
            raise UpstreamError(503, f"Route {route.name} is not configured")
        parsed = urlsplit(route.base_url)
        loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
            raise UpstreamError(503, f"Route {route.name} must use HTTPS or an explicit loopback URL")
        if route.provider not in {"runpod", "openai", "anthropic"}:
            raise UpstreamError(503, f"Route {route.name} has an unsupported provider adapter")

        if route.provider == "anthropic":
            headers = {
                "Content-Type": "application/json",
                "x-api-key": route.api_key,
                "anthropic-version": "2023-06-01",
            }
            result = self.transport(
                _anthropic_messages_url(route.base_url),
                headers,
                _to_anthropic(body, route),
            )
            return _from_anthropic(result.payload, route)

        outgoing = dict(body)
        outgoing["model"] = route.upstream_model
        headers = {
            "Authorization": f"Bearer {route.api_key}",
            "Content-Type": "application/json",
        }
        result = self.transport(_chat_completions_url(route.base_url), headers, outgoing)
        response = dict(result.payload)
        response["model"] = route.name
        return response
