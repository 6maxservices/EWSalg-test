"""Run safe red-team checks; a guard that did not run is a failure."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Callable
from urllib import error, request

from tools.check_staged import scan
from tools.evidence import EvidenceError, add_measure


@dataclass(frozen=True)
class DrillResult:
    name: str
    status: str
    detail: str


def _gateway_call(base_url: str, payload: dict[str, object], origin: str | None, proxy_key: str) -> tuple[int, dict[str, object]]:
    headers = {"Content-Type": "application/json"}
    if origin:
        headers["X-Origin"] = origin
    if proxy_key:
        headers["Authorization"] = f"Bearer {proxy_key}"
    outgoing = request.Request(
        f"{base_url.rstrip('/')}/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(outgoing, timeout=10) as response:
            return response.status, json.loads(response.read())
    except error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _expected_block(name: str, call: Callable[[], tuple[int, dict[str, object]]], code: str) -> DrillResult:
    try:
        status, body = call()
        actual = body.get("error", {}).get("code") if isinstance(body.get("error"), dict) else None
        if status == 403 and actual == code:
            return DrillResult(name, "PASS", f"blocked with {code}")
        return DrillResult(name, "FAIL", f"unexpected gateway result: HTTP {status}, code={actual}")
    except Exception as exc:
        return DrillResult(name, "FAIL", f"guard did not run: {type(exc).__name__}")


def gateway_checks(base_url: str, proxy_key: str) -> list[DrillResult]:
    canary_payload = {
        "model": "public-gpt",
        "messages": [{"role": "user", "content": "DRILL_CANARY_TERM"}],
    }
    clean_payload = {
        "model": "public-gpt",
        "messages": [{"role": "user", "content": "Explain a generic rolling median."}],
    }
    return [
        _expected_block(
            "public-route-canary",
            lambda: _gateway_call(base_url, canary_payload, "manual-approved", proxy_key),
            "dlp_block",
        ),
        _expected_block(
            "public-route-missing-origin",
            lambda: _gateway_call(base_url, clean_payload, None, proxy_key),
            "origin_block",
        ),
    ]


def git_guard_check() -> DrillResult:
    try:
        with tempfile.TemporaryDirectory(prefix="ews-drill-git-") as temporary:
            repo = Path(temporary)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", "https://example.invalid/external.git"], check=True)
            fixture = repo / "drill-secret.txt"
            fixture.write_text("EWS_DRILL_TEST_SECRET\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo), "add", "drill-secret.txt"], check=True)
            findings = scan(repo, repo / "missing-blocklist.txt", ("file://", "ssh://localhost"))
            if ("drill-secret.txt", "secret") in findings:
                return DrillResult("pre-commit-secret", "PASS", "staged guard rejected the fixture")
            return DrillResult("pre-commit-secret", "FAIL", "staged guard allowed the fixture")
    except Exception as exc:
        return DrillResult("pre-commit-secret", "FAIL", f"guard did not run: {type(exc).__name__}")


def firewall_check(project_root: Path) -> DrillResult:
    if os.name != "nt":
        return DrillResult("egress-firewall", "FAIL", "no supported firewall verifier ran on this OS")
    script = project_root / "scripts" / "network" / "Test-EgressFirewall.ps1"
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-File", str(script)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return DrillResult("egress-firewall", "PASS", "strict outbound profile and allow rules are active")
        return DrillResult("egress-firewall", "FAIL", "firewall verifier reported inactive protection")
    except Exception as exc:
        return DrillResult("egress-firewall", "FAIL", f"guard did not run: {type(exc).__name__}")


def run_drill(project_root: Path, gateway_url: str, proxy_key: str) -> dict[str, object]:
    results = [*gateway_checks(gateway_url, proxy_key), git_guard_check(), firewall_check(project_root)]
    return {
        "schema_version": 1,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if all(item.status == "PASS" for item in results) else "FAIL",
        "skip_policy": "SKIP is treated as FAIL",
        "expected_canary": "DRILL_CANARY_TERM",
        "results": [asdict(item) for item in results],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--gateway-url", default="http://127.0.0.1:4000")
    parser.add_argument("--proxy-key", default=os.getenv("PROXY_API_KEY", ""))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--record-evidence", action="store_true")
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    report = run_drill(project_root, args.gateway_url, args.proxy_key)
    output = args.output or project_root / "var" / "drill" / f"drill-{datetime.now(timezone.utc).date().isoformat()}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.record_evidence:
        try:
            add_measure(
                project_root / "evidence",
                "red-team-drill",
                report["status"],
                datetime.now(timezone.utc).date().isoformat(),
                [output],
                "Automated safe drill; see the hashed local report.",
            )
        except EvidenceError as exc:
            report["status"] = "FAIL"
            report["evidence_error"] = str(exc)

    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
