# EWS V2.0 Logic & Calculation Report

This report explains the 5-layer logic used in the Early Warning System (EWS) V2.0 and provides the specific formulas for each field in the Signal Log.

## 1. Engine Architecture (5-Layer Logic)

1.  **Robust Baseline**: Calculates the "normal" state using Median and Dispersion (MAD/IQR) over a sliding window.
2.  **Point Anomaly**: Uses **EWMA** (Exponentially Weighted Moving Average) to smooth raw data and calculates a **Z-Score** against the baseline.
3.  **Drift Detection**: Uses **CUSUM** (Cumulative Sum) to detect slow, persistent shifts that a Z-score might miss.
4.  **Adaptive Thresholds**: Uses **Conformal Prediction** to set Warning/Critical limits based on historical error (residuals) rather than fixed numbers.
5.  **Health Score**: Aggregates all signals into a single 0-100% readiness metric.

---

## 2. Field Calculations

| Field | Calculation Logic | Description |
| :--- | :--- | :--- |
| **Week** | `YYYY-MM-DD` | The Monday starting the 7-day aggregation period. |
| **Raw** | `sum(values)` or `avg(values)` | The raw metric value after weekly aggregation. |
| **S(t)** | `α * X_t + (1 - α) * S_{t-1}` | **EWMA Smoothed Value**. Reduces noise to prevent false positives. |
| **Median** | `median(window)` | The middle value of the last `N` weeks (default window = 12). |
| **Disp.** | `MAD` or `IQR` | **Dispersion**. Measures how much the data typically varies. |
| **Z** | `0.6745 * (S(t) - Median) / Disp` | **Z-Score**. How many "standard deviations" the current point is from the median. |
| **Conf%** | `min(TotalHistory / 20, 1.0)` | **Confidence Level**. Now reflects the *total* weeks of data provided. Reaches 100% at 20 weeks. |
| **Thresholds** | `Percentile(Residuals, α)` | Dynamic limits calculated via Conformal Prediction. |
| **CUSUM** | `max(0, S_prev + Z - k)` | Cumulative sum for detecting increasing/decreasing drift. |
| **L2 Alert** | `abs(Z) > Threshold` | Alert based purely on the current Point Anomaly. |
| **Final Alert** | `L2 + CUSUM Override` | Final status. Can trigger "WARNING" if CUSUM detects drift even if Z is low. |

---

## 3. Dynamic Confidence Level

Previously, the confidence was capped because it only looked at the completeness of the **12-week baseline window**.

As per your request, the logic has been updated:
- It now looks at the **full history** of data you have uploaded.
- **Formula**: `Total Weeks / 20` (Capped at 100%).
- It reaches **100%** once you have **20 weeks** of non-gap data.
- 20 weeks is the industry standard for establishing a statistically significant baseline.

---

## 4. Interactive Logic Validator

The **Docs Tab** contains a live validator that allows for manual verification of any data sequence.

*   **Baseline Logic**: The validator ignores the last data point in your string to build a historical baseline, then evaluates the last point against it.
*   **Step-by-Step Audit**: It breaks down the math (Median -> MAD -> Deviation -> Z-Score) so you can compare the machine logic against a manual calculator if desired.
*   **Weekly Scaling**: It uses the same scaling logic as the main engine, ensuring that "Confidence" correctly reflects the depth of your data input.
