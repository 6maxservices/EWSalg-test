from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from tools.evidence import EvidenceError, add_decision, add_measure, read_chain, report


class EvidenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "evidence"
        self.config = Path(self.temporary.name) / "config.txt"
        self.config.write_text("safe config\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_append_verify_and_as_of_report(self) -> None:
        add_measure(self.root, "gateway", "1.0", "2026-01-01", [self.config], "initial")
        add_measure(self.root, "gateway", "1.1", "2026-02-01", [self.config], "update")
        add_decision(self.root, "Use loopback", "Reduce exposure", "2026-01-02")
        January = report(self.root, "2026-01-31")
        February = report(self.root, "2026-02-28")
        self.assertEqual(January["active_measures"][0]["version"], "1.0")
        self.assertEqual(February["active_measures"][0]["version"], "1.1")
        self.assertEqual(February["chain_status"], "verified")

    def test_manual_edit_breaks_hash_chain(self) -> None:
        add_measure(self.root, "gateway", "1.0", "2026-01-01", [], "initial")
        path = self.root / "measures.jsonl"
        value = json.loads(path.read_text(encoding="utf-8"))
        value["version"] = "tampered"
        path.write_text(json.dumps(value) + "\n", encoding="utf-8")
        with self.assertRaises(EvidenceError):
            read_chain(path)


if __name__ == "__main__":
    unittest.main()
