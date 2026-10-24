"""Loopback-only HTTP server for the gateway application."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from typing import Any

from .app import GatewayApplication, GatewayResponse
from .config import GatewayConfig


class GatewayHttpServer(ThreadingHTTPServer):
    app: GatewayApplication
    max_request_bytes: int


class GatewayHandler(BaseHTTPRequestHandler):
    server: GatewayHttpServer

    def _send(self, response: GatewayResponse) -> None:
        raw = json.dumps(response.payload, ensure_ascii=False).encode("utf-8")
        self.send_response(response.status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:3000")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Origin, X-Complexity")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        headers = {key.lower(): value for key, value in self.headers.items()}
        if self.path == "/healthz":
            self._send(self.server.app.health())
        elif self.path in {"/v1/models", "/models"}:
            self._send(self.server.app.list_models(headers))
        else:
            self._send(GatewayResponse(404, {"error": {"code": "not_found", "message": "Unknown route"}}))

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {"/v1/chat/completions", "/chat/completions"}:
            self._send(GatewayResponse(404, {"error": {"code": "not_found", "message": "Unknown route"}}))
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send(GatewayResponse(400, {"error": {"code": "invalid_length", "message": "Invalid Content-Length"}}))
            return
        if content_length <= 0 or content_length > self.server.max_request_bytes:
            self._send(GatewayResponse(413, {"error": {"code": "request_too_large", "message": "Request body rejected"}}))
            return
        try:
            body: Any = json.loads(self.rfile.read(content_length))
        except json.JSONDecodeError:
            self._send(GatewayResponse(400, {"error": {"code": "invalid_json", "message": "Body must be valid JSON"}}))
            return
        headers = {key.lower(): value for key, value in self.headers.items()}
        self._send(self.server.app.chat_completions(body, headers))

    def log_message(self, format: str, *args: object) -> None:
        # Avoid default access logging; query metadata is already recorded safely.
        return


def serve(config: GatewayConfig | None = None) -> None:
    runtime = config or GatewayConfig.from_env()
    server = GatewayHttpServer((runtime.host, runtime.port), GatewayHandler)
    server.app = GatewayApplication(runtime)
    server.max_request_bytes = runtime.max_request_bytes
    print(f"Local gateway listening on http://{runtime.host}:{runtime.port}")
    server.serve_forever()
