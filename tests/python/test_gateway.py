from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from security_gateway import GatewayApplication, GatewayConfig, RouteConfig
from security_gateway.providers import HttpResult, ProviderClient, UpstreamError


class GatewayTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "blocklist.txt").write_text("FORBIDDEN_PROJECT\n", encoding="utf-8")
        (self.root / "aliases.json").write_text(json.dumps({"internal_name": "module_alpha"}), encoding="utf-8")
        self.calls: list[tuple[str, dict]] = []

        def sender(route: RouteConfig, body: dict) -> dict:
            self.calls.append((route.name, body))
            return {
                "id": "test",
                "choices": [{"message": {"role": "assistant", "content": "module_alpha result"}}],
            }

        routes = {
            name: RouteConfig(name, provider, "https://example.invalid/v1", "test-key", "upstream", public)
            for name, provider, public in (
                ("private-fast", "runpod", False),
                ("private-core", "runpod", False),
                ("public-gpt", "openai", True),
                ("public-claude", "anthropic", True),
            )
        }
        self.config = GatewayConfig(
            host="127.0.0.1",
            port=4000,
            proxy_api_key="local-key",
            allowed_origins=frozenset({"sanitizer", "manual-approved"}),
            blocklist_path=self.root / "blocklist.txt",
            aliases_path=self.root / "aliases.json",
            query_log_path=self.root / "query.sqlite3",
            complexity_char_threshold=30,
            max_request_bytes=10000,
            routes=routes,
        )
        self.app = GatewayApplication(self.config, sender)
        self.auth = {"authorization": "Bearer local-key"}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def request(self, model: str, content: str, **headers: str):
        return self.app.chat_completions(
            {"model": model, "messages": [{"role": "user", "content": content}]},
            {**self.auth, **headers},
        )

    def test_public_route_requires_origin_even_for_clean_content(self) -> None:
        response = self.request("public-gpt", "generic question")
        self.assertEqual(response.status, 403)
        self.assertEqual(response.payload["error"]["code"], "origin_block")
        self.assertEqual(self.calls, [])

    def test_dlp_blocks_before_provider_call_and_does_not_store_prompt(self) -> None:
        response = self.request("public-gpt", "FORBIDDEN_PROJECT details", **{"x-origin": "manual-approved"})
        self.assertEqual(response.status, 403)
        self.assertEqual(response.payload["error"]["code"], "dlp_block")
        self.assertNotIn(b"FORBIDDEN_PROJECT", self.config.query_log_path.read_bytes())
        connection = sqlite3.connect(self.config.query_log_path)
        try:
            row = connection.execute("SELECT dlp_result, outcome, prompt_sha256 FROM query_events").fetchone()
        finally:
            connection.close()
        self.assertEqual(row[:2], ("block", "dlp_block"))
        self.assertEqual(len(row[2]), 64)

    def test_aliases_are_applied_outbound_and_reversed_inbound(self) -> None:
        response = self.request("public-gpt", "review internal_name", **{"x-origin": "sanitizer"})
        self.assertEqual(response.status, 200)
        self.assertEqual(self.calls[0][1]["messages"][0]["content"], "review module_alpha")
        self.assertEqual(response.payload["choices"][0]["message"]["content"], "internal_name result")
        connection = sqlite3.connect(self.config.query_log_path)
        try:
            rows = connection.execute("SELECT outcome FROM query_events ORDER BY id").fetchall()
        finally:
            connection.close()
        self.assertEqual(rows, [("preflight",), ("pass",)])

    def test_private_routes_bypass_public_policy(self) -> None:
        response = self.request("private-fast", "FORBIDDEN_PROJECT full context")
        self.assertEqual(response.status, 200)
        self.assertEqual(self.calls[0][0], "private-fast")

    def test_cost_aware_private_auto_routing_is_overrideable(self) -> None:
        short = self.request("private-auto", "short")
        long = self.request("private-auto", "x" * 40)
        tagged = self.request("private-auto", "short", **{"x-complexity": "core"})
        self.assertEqual([short.status, long.status, tagged.status], [200, 200, 200])
        self.assertEqual([call[0] for call in self.calls], ["private-fast", "private-core", "private-core"])

    def test_invalid_proxy_key_is_rejected(self) -> None:
        response = self.app.chat_completions(
            {"model": "private-fast", "messages": []},
            {"authorization": "Bearer wrong"},
        )
        self.assertEqual(response.status, 401)

    def test_malformed_message_is_rejected_before_egress(self) -> None:
        response = self.app.chat_completions(
            {"model": "private-fast", "messages": ["not-a-message"]},
            self.auth,
        )
        self.assertEqual(response.status, 400)
        self.assertEqual(self.calls, [])

    def test_provider_rejects_insecure_remote_url(self) -> None:
        route = RouteConfig("private-fast", "runpod", "http://example.invalid", "key", "model", False)
        with self.assertRaises(UpstreamError):
            ProviderClient(lambda *_: HttpResult(200, {})).send(route, {"messages": []})

    def test_provider_allows_explicit_loopback_http(self) -> None:
        captured: list[str] = []

        def transport(url: str, _headers: dict, _body: dict) -> HttpResult:
            captured.append(url)
            return HttpResult(200, {"choices": []})

        route = RouteConfig("private-fast", "runpod", "http://127.0.0.1:8000/v1", "key", "model", False)
        response = ProviderClient(transport).send(route, {"messages": []})
        self.assertEqual(response["model"], "private-fast")
        self.assertEqual(captured, ["http://127.0.0.1:8000/v1/chat/completions"])


if __name__ == "__main__":
    unittest.main()
