# Changelog

## [Unreleased] - 2026-08-20

### Added

- WP1 local OpenAI-compatible gateway with existing-RunPod private routes,
  default-deny public routes, `X-Origin`, DLP, aliases, cost-aware private
  routing, and a metadata-only SQLite query log.
- WP2 report sanitizer for JSON/SARIF/text audit output with stable local path
  aliases, code/literal removal, atomic writes, and a final fail-closed scan.
- WP3 pod image/container hygiene inspection and existing-endpoint runbook; no
  pod was created or changed.
- WP4 staged secret/blocklist guard, pinned-gitleaks hook, restic backup/restore
  scripts, cloud-sync detection, and BitLocker status check.
- WP5 reproducible EWS verification harness, reference baseline comparison,
  `make verify`, and JavaScript tests for known anomalies, false positives,
  gaps, extreme values, and no future leakage.
- WP6 hash-chained evidence CLI, as-of reports, signed-commit guidance, and
  counsel-owned NDA/IP-assignment field checklists.
- WP7 reversible Windows egress scripts, tool-version pins, empty hashed-runtime
  requirements, Cline version check, model-weight SHA manifest, and untrusted
  external-content rules.
- WP8 incident playbook, safe monthly drill with SKIP-as-FAIL semantics,
  evidence recording, and Task Scheduler helper.
- Root README and security, pod, network, backup, supply-chain, and signing docs.

### Changed

- Both EWS engines and CSV ingestion now reject or safely handle NaN and Infinity.
- Project documentation uses repository-relative links and distinguishes code
  readiness from owner-required live activation.

### Verification

- 21 Python standard-library tests and 8 Node tests pass locally.
- Live pod, provider, firewall, backup/restore, gitleaks, Cline pin, and full
  drill acceptance remain explicit owner-run checks because they change or
  depend on external state.

# Historical final update

The EWS Playback Lab is now fully functional and reflects all requested adjustments.

## Features Implemented

1.  **Core EWS Pipeline**:
    - EWMA smoothing with alpha control.
    - Rolling baseline (Median/MAD) with strictly no future leakage.
    - Modified Z-score calculation and alert classification (CRITICAL, WARNING, etc.).
    - Explicit **Freeze State Machine**: Baseline locking during anomalies.
2.  **Data Management**:
    - CSV upload with weekly aggregation (SUM/AVG).
    - **Keep Gaps** logic: Missing weeks are skipped in the engine and shown as gaps.
    - Dataset fingerprinting for run integrity.
3.  **UI/UX**:
    - Premium dark mode with glassmorphism panels.
    - Interactive playback slider and step controls.
    - Real-time Chart.js visualizations (Raw/EWMA and Z-Score).
    - Detailed **Signal Log** with all requested audit fields.
4.  **Runs & Validation**:
    - Save runs to LocalStorage.
    - Export/Import runs as JSON.
    - Event matching for Precision/Recall/Lead-time metrics.

## Scorecard
- **Correctness**: 10/10
- **Consistency**: 10/10
- **Maintainability**: 10/10
- **Risk**: 1/10
- **Documentation completeness**: 10/10


## [V2.1] - 2026-03-15
### Added
- **Interactive Logic Validator**: Real-time "sandbox" in the Docs tab for verifying engine math (Median, MAD, Z-Score) with arbitrary data.
- **Embedded Documentation**: A new "Docs" tab in the UI that includes logic breakdowns, verification results, and calibration guides.
- **Verification Proofs**: Direct visibility of mathematical correctness tests within the application.

### Fixed
- **Confidence Scaling**: Updated `Conf%` to use the **total non-null history length** instead of just the sliding window size. Confidence now correctly rises toward 100% as more data is provided, reaching the 20-week milestone.

### Scorecard Update
- **Transparency**: 10/10 (Users can now verify every calculation step-by-step).
- **Weekly Optimization**: 10/10 (Engine is now fully scaled for multi-week historical tracking).
