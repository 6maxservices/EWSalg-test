# Incident playbook

This playbook preserves evidence first and avoids guessing. The owner of the
machine and provider accounts is the incident commander unless another person
is named locally. Record every action and timestamp in the evidence log.

## 1. Prompt or source sent to a public LLM

Target: contain within 30 minutes; complete the initial exposure assessment
within 4 hours.

1. Stop the client and public route; preserve `var/query-log.sqlite3` read-only.
2. Identify timestamp, route, origin, prompt hash, and provider. The log has no
   prompt body, so correlate only with the user's local source/history.
3. Assess whether the material exposed two or more of domain, pipeline, and
   real data/schema. Record uncertainty rather than reconstructing content in a
   public tool.
4. Delete the provider conversation/request where supported and submit the
   provider's data-deletion request. Preserve request IDs and confirmations.
5. Rotate any exposed secret using the provider console, then add an evidence
   decision and measure with the incident date.
6. Add a regression fixture that contains only a synthetic equivalent; run
   `make drill` and `make verify`.

## 2. API key exposure

Target: revoke within 15 minutes.

1. Revoke the key in RunPod/OpenAI/Anthropic; do not merely remove it locally.
2. Create a least-privilege replacement and update only the local `.env` or
   password manager.
3. Compare provider usage/billing with the local query log. Treat unmatched
   usage as a separate egress incident.
4. Search tracked history with the staged guard/gitleaks. If a secret entered
   history, keep it revoked and follow the repository's history-rewrite policy.
5. Record the incident and rotation in `evidence/`.

## 3. Suspicious dependency, extension, image, or model update

Target: isolate immediately; decide rollback within 4 hours.

1. Disconnect the affected tool from the core session and enable the egress
   guard. Do not run the suspicious package again for diagnosis.
2. Preserve package lockfiles, image digest, extension version, model manifest,
   process list, and relevant logs.
3. Roll back to the previously reviewed pinned version/digest/SHA.
4. Run `npm ci`, `npm test`, `make verify`, `python -m tools.verify_weights
   verify ...`, and pod hygiene inspection as applicable.
5. Record what executed, what files it could access, and the review decision.

## 4. Lost or stolen development machine

Target: revoke remote credentials within 30 minutes.

1. Use the password manager/offline inventory to revoke RunPod, LLM API, Git,
   backup, and signing credentials. Remote-lock/wipe only through an already
   configured trusted device-management service.
2. Confirm the last known BitLocker status from evidence; do not assume disk
   encryption was active.
3. Check provider billing and Git activity for use after the loss time.
4. Restore the latest encrypted backup onto a trusted replacement machine and
   run `scripts/restore_test.ps1` plus the full verification suite.
5. Record recovery point, revoked credentials, and residual exposure.

## Monthly drill

`make drill` checks the `DRILL_CANARY_TERM`, missing `X-Origin`, a synthetic
staged secret, and the active Windows firewall policy. The owner must add the
canary to the real local blocklist. The code deliberately does not add it. Any
guard that cannot run is a failure, not a pass.

Preview Task Scheduler setup with `scripts/schedule_drill.ps1`; use `-Install`
only after a manual successful drill. Configure failure notification in Task
Scheduler or the owner's local monitoring channel.
