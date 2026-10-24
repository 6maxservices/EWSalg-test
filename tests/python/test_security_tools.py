from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from tools.check_pod_hygiene import analyze_inspect, analyze_text
from tools.check_staged import scan
from tools.query_log import rotate, summarize
from tools.verify_weights import record, verify
from security_gateway.query_log import QueryEvent, QueryLog


class SecurityToolsTest(unittest.TestCase):
    def test_pod_hygiene_redacts_findings_and_detects_risks(self) -> None:
        findings = analyze_text("history", "RUNPOD_API_KEY=supersecretvalue COPY src /app", [])
        self.assertEqual({item["code"] for item in findings}, {"secret-material", "source-copy"})
        self.assertNotIn("supersecretvalue", json.dumps(findings))
        mounts = analyze_inspect([{"Mounts": [{"Source": "C:/private/project", "Destination": "/data"}]}], [])
        self.assertTrue(any(item["code"] == "persistent-sensitive-volume" for item in mounts))

    def test_weight_manifest_detects_change(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            weight = root / "model.safetensors"
            weight.write_bytes(b"version-one")
            manifest = record(root)
            self.assertEqual(verify(root, manifest)["status"], "PASS")
            weight.write_bytes(b"version-two")
            self.assertEqual(verify(root, manifest)["status"], "FAIL")

    def test_staged_guard_blocks_secret_for_external_remote(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", "https://example.invalid/repo.git"], check=True)
            (repo / "secret.txt").write_text("EWS_DRILL_TEST_SECRET\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo), "add", "secret.txt"], check=True)
            self.assertIn(("secret.txt", "secret"), scan(repo, repo / "none", ("file://",)))

    def test_query_log_rotation_archives_only_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            database = root / "query.sqlite3"
            log = QueryLog(database)
            event = QueryEvent("private-fast", "runpod", "none", "VERY_SECRET_PROMPT", 0, "not-required", "not-required", "pass", 200)
            log.append(event)
            log.append(event)
            connection = __import__("sqlite3").connect(database)
            try:
                connection.execute("UPDATE query_events SET timestamp = '2026-01-01T00:00:00+00:00' WHERE id = 1")
                connection.execute("UPDATE query_events SET timestamp = '2026-03-01T00:00:00+00:00' WHERE id = 2")
                connection.commit()
            finally:
                connection.close()
            archive = root / "archive.jsonl"
            result = rotate(database, "2026-02-01", archive)
            self.assertEqual(result["rotated_events"], 1)
            self.assertNotIn("VERY_SECRET_PROMPT", archive.read_text(encoding="utf-8"))
            self.assertEqual(sum(group["events"] for group in summarize(database)["groups"]), 1)


if __name__ == "__main__":
    unittest.main()
