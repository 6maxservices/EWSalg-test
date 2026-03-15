# Architecture

## Technical Stack

- **Frontend**: Vite + Vanilla JS + HTML5 + CSS3.
- **Styling**: Vanilla CSS (Premium aesthetics, dark mode, glassmorphism).
- **Data Parsing**: [PapaParse](https://www.papaparse.com/) (CSV).
- **Visualization**: [Chart.js](https://www.chartjs.org/).
- **Persistence**: LocalStorage (for saved Runs).

## Core Components

1.  **Data Engine**: Handles CSV parsing, weekly aggregation, and missing-week logic.
2.  **Pipeline Engine**: Original EWS algorithm (V1).
3.  **V2 Engine (Advanced)**: A 5-layer pipeline designed for high sensitivity and low false alarms:
    - **Layer 1: Robust Baseline**: Calculates the "normal" state using Median and falling back to IQR or Range if the data is flat (MAD=0).
    - **Layer 2: Point Anomaly**: Applies EWMA smoothing to the *incoming* value to filter out single-week noise.
    - **Layer 3: CUSUM (Drift)**: Detects "slow leaks" by accumulating small deviations that wouldn't trigger a standard alert.
    - **Layer 4: Conformal Thresholds**: Adaptive boundaries that learn from historical "noise" to tighten or loosen sensitivity automatically.
    - **Layer 5: Health Score**: A 0-100% metric representing the overall stability of the series.
4.  **Playback Controller**: Manages temporal state (shared or independent between versions).
4.  **UI Controller**: Orchestrates the multi-tab layout and synchronization between charts, tables, and controls.
5.  **Validation Engine**: Calculates precision, recall, and lead-time metrics based on manual labels or event files.
6.  **Docs Tab & Interactive Validator**: A built-in documentation module that provides real-time logic verification and a mathematical sandbox for testing calculations against manual data entries.

## Workflow

1.  **Upload**: User provides CSV data.
2.  **Calibrate**: User adjusts alpha, window size, and thresholds.
3.  **Playback**: User steps through time or plays back the series.
4.  **Save/Compare**: User saves "Runs" to compare result sets.
5.  **Validate**: User labels alerts as TP/FP/FN/TN to see performance metrics.
