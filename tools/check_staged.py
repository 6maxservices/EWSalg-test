"""Pre-commit guard for secrets and external-remote blocklist terms."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
from typing import Iterable


SECRET_PATTERNS = (
    re.compile(r"\b(?:sk|rpa|ghp|github_pat)_[A-Za-z0-9_-]{16,}\b"),
    re.compile(
        r"\b(?:API_KEY|TOKEN|PASSWORD|SECRET)\s*[:=]\s*['\"]?(?!(?:REPLACE|SET_|YOUR_|EXAMPLE|CHANGEME)\b)[A-Za-z0-9_./+=-]{12,}",
        re.IGNORECASE,
    ),
    re.compile(r"EWS_DRILL_TEST_SECRET"),
)
DEFAULT_SAFE_PREFIXES = ("file://", "ssh://localhost", "git@localhost:", "http://localhost", "https://localhost")


def run_git(repo: Path, arguments: list[str], *, binary: bool = False) -> bytes | str:
    result = subprocess.run(
        ["git", "-C", str(repo), *arguments],
        check=True,
        capture_output=True,
        text=not binary,
    )
    return result.stdout


def staged_files(repo: Path) -> list[str]:
    raw = run_git(repo, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"], binary=True)
    assert isinstance(raw, bytes)
    return [item.decode("utf-8", errors="surrogateescape") for item in raw.split(b"\0") if item]


def staged_content(repo: Path, path: str) -> str:
    raw = run_git(repo, ["show", f":{path}"], binary=True)
    assert isinstance(raw, bytes)
    if b"\0" in raw:
        return ""
    return raw.decode("utf-8", errors="replace")


def remote_urls(repo: Path) -> list[str]:
    try:
        raw = run_git(repo, ["remote", "-v"])
    except subprocess.CalledProcessError:
        return []
    assert isinstance(raw, str)
    return [parts[1] for line in raw.splitlines() if len(parts := line.split()) >= 2]


def is_external_repo(repo: Path, safe_prefixes: Iterable[str]) -> bool:
    urls = remote_urls(repo)
    if not urls:
        return False
    prefixes = tuple(safe_prefixes)
    return any(not url.startswith(prefixes) for url in urls)


def load_blocklist(path: Path) -> list[re.Pattern[str]]:
    if not path.is_file():
        return []
    patterns: list[re.Pattern[str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        value = raw.strip()
        if value and not value.startswith("#"):
            patterns.append(re.compile(value, re.IGNORECASE | re.MULTILINE))
    return patterns


def scan(repo: Path, blocklist: Path, safe_prefixes: Iterable[str]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    external = is_external_repo(repo, safe_prefixes)
    block_patterns = load_blocklist(blocklist) if external else []
    for path in staged_files(repo):
        content = staged_content(repo, path)
        if not content:
            continue
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            findings.append((path, "secret"))
        if block_patterns and any(pattern.search(content) for pattern in block_patterns):
            findings.append((path, "external-remote-blocklist"))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--blocklist", type=Path, default=Path("config/blocklist.txt"))
    args = parser.parse_args()
    prefixes = tuple(
        item.strip()
        for item in os.getenv("SAFE_GIT_REMOTE_PREFIXES", ",".join(DEFAULT_SAFE_PREFIXES)).split(",")
        if item.strip()
    )
    try:
        findings = scan(args.repo.resolve(), args.blocklist, prefixes)
    except (subprocess.CalledProcessError, FileNotFoundError, re.error) as exc:
        print(f"Staged guard failed closed because it could not run ({type(exc).__name__}).")
        return 2
    if findings:
        for path, category in findings:
            print(f"BLOCK {path}: {category}")
        print("Commit rejected. Matching content is intentionally not printed.")
        return 1
    print("Staged guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
