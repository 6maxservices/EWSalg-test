# Modules

## Data Module
- Responsible for CSV ingestion and transformation.
- Handles date parsing and aggregation.

## Pipeline Module (V1)
- Contains the core EWS algorithm logic (Original).

## Pipeline Module (V2)
- Advanced 5-layer logic: Robust Baseline, Conformal Prediction, CUSUM Drift.

## UI Module
- Manages the DOM, events, and tab switching.
- Premium styling implementation.

## Run Module
- Handles saving, retrieving, and comparing historical runs.

## Validation Module
- Logic for calculating performance metrics based on events or manual labels.

## Local Security Gateway
- OpenAI-compatible private/public route adapter.
- Origin allowlist, DLP blocklist, aliases, and metadata-only query log.

## Report Sanitizer
- Normalizes audit output, removes code/literals, aliases paths, and fails
  closed when the final export violates the blocklist.

## Verification Harness
- Generates reproducible weekly scenarios with known anomalies, gaps, drift,
  and extreme values; compares Engine V2 with a reference implementation.

## Evidence and Operational Controls
- Hash-chained measures/decisions, pod and model verification, staged guards,
  encrypted backup/restore checks, firewall scripts, and incident drills.
