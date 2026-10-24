# EWS Playback Lab

EWS Playback Lab is a local Vite application for replaying weekly metric time
series through the V1 and V2 early-warning engines. This repository also
contains the local security layer specified in the project protection guides:
an OpenAI-compatible gateway, report sanitizer, verification harness, evidence
log, pod/backup/network checks, and incident drills.

## Application

```powershell
npm ci --ignore-scripts
npm run dev
```

Review any package install scripts separately. The current lockfile builds after
`npm ci --ignore-scripts`. Use `npm test`, `npm run verify`, and `npm run build`
before release.

## Connect the pod that already exists

The repository never creates a RunPod endpoint. It connects the existing
OpenAI-compatible endpoint to a loopback gateway:

1. Copy `.env.example` to the ignored `.env` and fill the existing RunPod URL,
   model ID, API key, and a random local `PROXY_API_KEY`.
2. Copy `config/blocklist.example.txt` to the ignored
   `config/blocklist.txt`. The owner, not an agent, adds the real terms and the
   `DRILL_CANARY_TERM` test term.
3. Optionally copy the alias/library example files to their ignored live names.
4. Start the local gateway:

```powershell
python -m security_gateway
```

5. Point Cline or another OpenAI-compatible client to
   `http://127.0.0.1:4000/v1`, authenticate with `PROXY_API_KEY`, and select
   `private-auto`, `private-fast`, or `private-core`.

Public models require both an allowlisted `X-Origin` and a clean DLP scan.
Without a real local blocklist, public routes fail closed. Private routes go to
the existing pod without public-route filtering.

See [Security implementation](docs/SECURITY_IMPLEMENTATION.md) and
[Pod runbook](docs/POD_RUNBOOK.md).

## Security commands

```powershell
python -m tools.sanitize_report raw.json sanitized.json
python -m tools.evidence verify
python -m tools.query_log summary
python -m tools.check_pod_hygiene --image YOUR_PINNED_IMAGE
python -m tools.verify_weights verify --path LOCAL_MODEL_CACHE
python -m unittest discover -s tests/python -p "test_*.py"
```

`make verify` and `make drill` provide the requested one-command targets where
GNU Make is available. On Windows, the equivalent commands are documented in
the linked runbooks.

## Human-owned activation steps

The code intentionally does not activate the global firewall, write the real
blocklist, configure credentials, change the live pod, install Git hooks, sign
commits, or schedule drills. Those actions change the machine or an external
account and require the owner's review. Current readiness and exact activation
commands are tracked in [Security implementation](docs/SECURITY_IMPLEMENTATION.md).
