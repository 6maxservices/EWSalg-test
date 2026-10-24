# Decisions

## [2026-03-02] Initial Tech Stack Selection

- **Decision**: Use Vite with Vanilla JS instead of a heavy framework like React.
- **Rationale**: Minimal scope, fast delivery, and high performance requirement for playback.
- **Status**: Accepted.

## [2026-03-02] Charting Library

- **Decision**: Use Chart.js for visualizations.
- **Rationale**: Easy to integrate, responsive, and sufficient for the required line/scatter charts.
- **Status**: Accepted.

## [2026-03-02] Freeze Mechanism State Machine

- **Decision**: `frozen = true` after N consecutive weeks where `z <= warning_threshold`. 
- **Recovery**: `frozen = false` immediately when `z > warning_threshold`.
- **Reasoning**: Prevents baseline drift during prolonged anomalies.

## [2026-03-02] Dataset Fingerprinting

- **Decision**: Store a hash of stringified `(date, value)` rows as a fingerprint for each run.
- **Reasoning**: Ensures runs are not compared or loaded across different time series.

## [2026-03-02] Run Persistence Extras

- **Decision**: Add JSON Export/Import buttons for the Saved Runs.
- **Reasoning**: Overcomes LocalStorage limitations and allows sharing results.

## [2026-03-03] Conformal Prediction in V2

- **Decision**: Use Conformal Prediction for adaptive thresholds in V2.
- **Rationale**: Standard Z-scores assume data follows a perfect bell curve (normal distribution). Conformal Prediction is "distribution-free"—it looks at the actual historical errors to decide the range, making it far more accurate for messy real-world data.
- **Outcome**: It predicts the "safe range" for the current week instead of using static multipliers.

## [2026-08-20] Connect, Do Not Recreate, the Private Pod

- **Decision**: Treat RunPod as an existing OpenAI-compatible dependency and
  configure only local endpoint/model/key references.
- **Rationale**: The owner already created the pod; recreating or mutating it
  would exceed the implementation scope and could destroy working state.

## [2026-08-20] Standard-Library Local Gateway

- **Decision**: Use a small loopback Python gateway and provider adapters rather
  than add an unpinned proxy framework to the JavaScript application.
- **Rationale**: It covers the required routes/hooks with no runtime Python
  dependencies, keeps secrets out of the browser, and is directly unit-testable.

## [2026-08-20] Public Egress Is Fail-Closed

- **Decision**: A public route requires an owner-created blocklist plus an
  allowlisted `X-Origin`; private routes do not apply public DLP.
- **Rationale**: Missing policy or origin is absence of permission, while the
  existing private endpoint must remain usable for full technical context.

## [2026-08-20] Adapt Generic Causal Verification to EWS

- **Decision**: Verify known effects using seeded anomaly/drift time series,
  not a causal-DAG generator unrelated to this repository.
- **Rationale**: The protected algorithm here is an early-warning anomaly
  detector. Verification must exercise its true estimand, false-positive risk,
  gap handling, extreme values, and no-future-leakage property.

## [2026-08-20] Human-Owned High-Impact Activation

- **Decision**: Deliver reviewed scripts but do not activate the firewall,
  backup destination, Git hooks, signing, scheduler, real blocklist, keys, or
  live provider calls automatically.
- **Rationale**: These actions affect the machine, accounts, recoverability, or
  legal evidence and require explicit owner control and real environment data.
