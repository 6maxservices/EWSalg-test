from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from security_gateway.policy import DlpPolicy
from tools.sanitize_report import PathMapper, ReportSanitizer, SanitizationError


class SanitizerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.blocklist = self.root / "blocklist.txt"
        self.aliases = self.root / "aliases.json"
        self.blocklist.write_text("secret_project\nNEVER_EXPORT\n", encoding="utf-8")
        self.aliases.write_text(json.dumps({"secret_project": "project_alpha"}), encoding="utf-8")
        self.mapper = PathMapper.load(self.root / "mapping.json")
        self.sanitizer = ReportSanitizer(DlpPolicy(self.blocklist, self.aliases), self.mapper)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_bandit_output_drops_code_and_aliases_paths_and_names(self) -> None:
        value = {
            "results": [
                {
                    "test_name": "hardcoded_password",
                    "issue_severity": "HIGH",
                    "test_id": "B105",
                    "issue_text": "secret_project uses a risky literal 'private-value'",
                    "filename": "C:\\work\\secret_project\\core.py",
                    "code": "password = 'private-value'",
                }
            ]
        }
        result = self.sanitizer.sanitize("json", value)
        rendered = json.dumps(result)
        self.assertNotIn("secret_project", rendered)
        self.assertNotIn("private-value", rendered)
        self.assertNotIn("password =", rendered)
        self.assertIn("src/module_A/file_001.py", rendered)
        self.assertIn("project_alpha", rendered)

    def test_remaining_blocklist_term_fails_closed(self) -> None:
        value = {"results": [{"message": "NEVER_EXPORT", "severity": "low"}]}
        with self.assertRaises(SanitizationError):
            self.sanitizer.sanitize("json", value)

    def test_path_alias_is_stable_after_save_and_reload(self) -> None:
        first = self.mapper.alias("/private/a.py")
        self.mapper.save()
        second = PathMapper.load(self.mapper.path).alias("/private/a.py")
        self.assertEqual(first, second)

    def test_plain_text_source_lines_are_removed(self) -> None:
        result = self.sanitizer.sanitize(
            "text",
            "FAILED generic test\n    secret_value = 'literal'\nSummary: one failure\n",
        )
        rendered = json.dumps(result)
        self.assertNotIn("secret_value", rendered)
        self.assertNotIn("literal", rendered)
        self.assertIn("one failure", rendered)

    def test_semgrep_shape_removes_url_and_aliases_location(self) -> None:
        value = {
            "results": [
                {
                    "check_id": "python.lang.security.rule",
                    "path": "/srv/private/module.py",
                    "extra": {
                        "severity": "WARNING",
                        "message": "See https://scanner.example/finding/123 for details",
                        "lines": "dangerous_call('private')",
                    },
                }
            ]
        }
        rendered = json.dumps(self.sanitizer.sanitize("json", value))
        self.assertNotIn("scanner.example", rendered)
        self.assertNotIn("dangerous_call", rendered)
        self.assertNotIn("/srv/private/module.py", rendered)
        self.assertIn("src/module_A/file_001.py", rendered)


if __name__ == "__main__":
    unittest.main()
