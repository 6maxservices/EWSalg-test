"""Inspect an existing vLLM image/container without recreating the pod."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
from typing import Any, Callable


CommandRunner = Callable[[list[str]], str]
SECRET_PATTERN = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|(?:API_KEY|TOKEN|PASSWORD|SECRET)\s*=\s*[^\s$<{][^\s]{5,})",
    re.IGNORECASE,
)
SOURCE_PATTERN = re.compile(r"(?:COPY|ADD)\s+(?:\.|src|source|project|app/)", re.IGNORECASE)
VERBOSE_PATTERN = re.compile(r"(?:--enable-log-requests|--log-level[=\s]+(?:debug|trace)|VLLM_LOGGING_LEVEL=(?:DEBUG|TRACE))", re.IGNORECASE)


def _run(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout


def _blocklist_patterns(path: Path) -> list[re.Pattern[str]]:
    if not path.is_file():
        return []
    patterns = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        value = raw.strip()
        if value and not value.startswith("#"):
            patterns.append(re.compile(value, re.IGNORECASE))
    return patterns


def analyze_text(label: str, text: str, sensitive_patterns: list[re.Pattern[str]]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    checks = (
        (SECRET_PATTERN, "secret-material", "Potential secret material is present"),
        (SOURCE_PATTERN, "source-copy", "Image history appears to copy project/source content"),
        (VERBOSE_PATTERN, "verbose-request-logging", "Verbose request logging appears enabled"),
    )
    for pattern, code, message in checks:
        if pattern.search(text):
            findings.append({"surface": label, "code": code, "message": message})
    if any(pattern.search(text) for pattern in sensitive_patterns):
        findings.append({"surface": label, "code": "blocklist-match", "message": "Project-sensitive terminology is present"})
    return findings


def analyze_inspect(value: Any, sensitive_patterns: list[re.Pattern[str]]) -> list[dict[str, str]]:
    findings = analyze_text("inspect", json.dumps(value), sensitive_patterns)
    mount_risk = False

    def visit(item: Any) -> None:
        nonlocal mount_risk
        if isinstance(item, dict):
            for key, child in item.items():
                if str(key).lower() in {"mounts", "volumes", "volume_mounts"} and re.search(
                    r"(?:project|source|src|data)", json.dumps(child), re.IGNORECASE
                ):
                    mount_risk = True
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)
    if mount_risk:
        findings.append(
            {
                "surface": "mounts",
                "code": "persistent-sensitive-volume",
                "message": "A mount path may contain project data",
            }
        )
    return findings


def inspect_pod(
    image: str,
    container: str | None,
    blocklist: Path,
    deployment_config: Path | None,
    runner: CommandRunner = _run,
) -> dict[str, Any]:
    patterns = _blocklist_patterns(blocklist)
    history = runner(["docker", "history", "--no-trunc", image])
    inspect_target = container or image
    command = ["docker", "inspect", inspect_target] if container else ["docker", "image", "inspect", inspect_target]
    inspect_value = json.loads(runner(command))
    findings = analyze_text("image-history", history, patterns)
    findings.extend(analyze_inspect(inspect_value, patterns))
    if deployment_config:
        config_value = json.loads(deployment_config.read_text(encoding="utf-8"))
        findings.extend(analyze_inspect(config_value, patterns))
    return {
        "schema_version": 1,
        "status": "PASS" if not findings else "FAIL",
        "image": image,
        "container_inspected": bool(container),
        "checks": ["image-history", "image-inspect", "secrets", "source-files", "volumes", "request-logging"],
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--container")
    parser.add_argument("--blocklist", type=Path, default=Path("config/blocklist.txt"))
    parser.add_argument("--deployment-config", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = inspect_pod(args.image, args.container, args.blocklist, args.deployment_config)
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError, re.error) as exc:
        print(json.dumps({"status": "FAIL", "error": f"Pod inspection did not run: {type(exc).__name__}"}))
        return 2
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
