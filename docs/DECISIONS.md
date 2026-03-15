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
