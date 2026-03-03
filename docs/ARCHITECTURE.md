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
3.  **V2 Engine (NEW)**: Advanced 5-layer pipeline (Robust Baseline, Conformal Thresholds, CUSUM, Health Score).
4.  **Playback Controller**: Manages temporal state (shared or independent between versions).
4.  **UI Controller**: Orchestrates the multi-tab layout and synchronization between charts, tables, and controls.
5.  **Validation Engine**: Calculates precision, recall, and lead-time metrics based on manual labels or event files.

## Workflow

1.  **Upload**: User provides CSV data.
2.  **Calibrate**: User adjusts alpha, window size, and thresholds.
3.  **Playback**: User steps through time or plays back the series.
4.  **Save/Compare**: User saves "Runs" to compare result sets.
5.  **Validate**: User labels alerts as TP/FP/FN/TN to see performance metrics.
