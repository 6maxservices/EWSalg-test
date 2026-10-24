from __future__ import annotations

import unittest

from tools.drill import _expected_block


class DrillTest(unittest.TestCase):
    def test_expected_block_passes_only_for_exact_guard_result(self) -> None:
        passed = _expected_block("origin", lambda: (403, {"error": {"code": "origin_block"}}), "origin_block")
        wrong = _expected_block("origin", lambda: (200, {}), "origin_block")
        skipped = _expected_block("origin", lambda: (_ for _ in ()).throw(ConnectionError()), "origin_block")
        self.assertEqual(passed.status, "PASS")
        self.assertEqual(wrong.status, "FAIL")
        self.assertEqual(skipped.status, "FAIL")


if __name__ == "__main__":
    unittest.main()
