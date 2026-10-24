# Security implementation and readiness

The implementation turns the two protection guides into project code while
preserving one boundary: the existing RunPod is connected, not recreated.

| Work package | Implemented in the repository | Activation/readiness |
| --- | --- | --- |
| WP1 Proxy/DLP | Loopback OpenAI-compatible gateway; private/public routes; `X-Origin` default deny; regex blocklist; aliases; metadata-only SQLite log; `private-auto` routing | Fill `.env` and the owner-maintained blocklist, then run the live endpoint acceptance test |
| WP2 Sanitizer | JSON, SARIF, Bandit-like, pip-audit-like, and text normalization; stable ignored path mapping; code/literal removal; final blocklist scan; atomic output | Ready; real aliases/library categories remain owner-maintained |
| WP3 Pod hygiene | Existing endpoint connection template; image/container history, secret, source, volume, and verbose-log inspection | Run against the exact existing image/container; no pod was created or modified |
| WP4 Git/backups | Staged secret/blocklist guard; pinned-gitleaks hook; restic backup and checksum restore test; cloud-sync and BitLocker checks | Hooks, restic target/key, and backup schedule require owner activation |
| WP5 Verification | Reproducible EWS time-series generator, known anomaly/false-positive/gap/extreme/no-future-leakage tests, and a reference rolling Z-score | Automated tests pass locally; thresholds should be expanded with owner-approved domain cases |
| WP6 Evidence | Hash-chained append-only measure/decision CLI, config hashes, as-of reports, legal field checklists, signed-commit runbook | Ready; only the owner should add actual decisions and sign commits |
| WP7 Network/supply chain | Reversible Windows strict egress scripts, package-lock integrity, stdlib-only Python runtime, tool version pins, model-weight SHA verifier, external-content agent rule | Firewall and Cline version pin require owner activation; strict firewall IPs need periodic refresh |
| WP8 Incident/drill | Four-scenario playbook; canary, origin, staged-secret, and firewall drill; SKIP-as-FAIL; evidence recording; scheduler script | A full drill should fail until gateway, canary, hooks, and firewall are truly active |

## Security properties

- The gateway binds to `127.0.0.1` by default and can require a local API key.
- Public requests are denied when `X-Origin` is missing, invalid, or the real
  blocklist is unavailable.
- DLP scans the original payload before aliases are applied. Sanitized reports
  should already contain aliases and must pass a second scan at the gateway.
- Query logs contain route/provider/origin, timestamp, SHA-256, approximate
  length/tokens, policy outcomes, and status. Prompt text is not stored.
- Every provider call gets a durable metadata-only preflight record before
  egress and a completion record afterward. An unavailable log blocks egress.
- Review `python -m tools.query_log summary` monthly. Rotate older rows with
  `python -m tools.query_log rotate --before YYYY-MM-DD`; retain the
  metadata-only archive in the encrypted backup for mosaic/provenance review.
- Provider error bodies are not reflected because they may echo submitted text.
- The real blocklist, aliases, `.env`, logs, sanitizer mappings, firewall state,
  model manifests, drill reports, and verification reports are ignored by Git.

## Important limits

1. A process with local administrator rights can bypass a user-space gateway.
   The optional OS firewall reduces this risk but is not activated by code.
2. Hostname allowlists become IP rules on Windows. CDN/provider IP changes can
   interrupt service and require a reviewed reapply.
3. The repository is currently connected to a public GitHub remote. Treat it as
   the `shared` repository from the guides. Do not add future private core IP;
   keep that in a local-only or self-hosted repository.
4. Metadata hashes establish local provenance, not provider-side deletion or
   legal status. Preserve provider confirmations and seek legal advice where
   necessary.
5. The EWS harness uses controlled anomaly time series because this project's
   core is anomaly detection; the causal-DAG example in the generic guide is
   not the algorithm implemented here.

## Acceptance sequence

1. Configure the existing pod and real local policy files.
2. Run Python/JavaScript tests and `npm run build`.
3. Start the gateway and verify private routes with the existing pod.
4. Sanitize a synthetic audit fixture and verify a public call is blocked
   without origin, blocked by canary, and allowed only with valid origin plus
   safe content.
5. Inspect the existing pod image/container.
6. Review and activate Git hooks, encrypted backups, Cline pin, and firewall.
7. Run restore test, `npm run verify`, and `make drill`; record only genuine
   results in the evidence log.
