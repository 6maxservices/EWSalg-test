# Engine V2.0 Verification Report

This report documents the verification of the **EngineV2** mathematical logic, ensuring all calculations for Baseline, Dispersion, Z-Score, and Confidence are accurate.

## 1. Test Summary

A standalone verification script was executed on **March 15, 2026**, running the engine logic against controlled datasets with manually pre-calculated expected outcomes.

**Result**: ✅ **ALL TESTS PASSED**

---

## 2. Verified Test Cases

### Case 1: Baseline & Dispersion (MAD)
*   **Input Data**: `[10, 12, 11, 13]` (Window = 10)
*   **Expected Median**: `11.5` (Average of 11 and 12)
*   **Expected MAD**: `1.0` (Median Absolute Deviation)
*   **Actual Engine Result**: `Median: 11.5`, `MAD: 1.0`
*   **Status**: ✅ PASS

### Case 2: Z-Score Calculation
*   **Input**: `S(t) = 15`, `Median = 11.5`, `Dispersion = 1.0`
*   **Formula**: `0.6745 * (15 - 11.5) / 1.0`
*   **Expected Z**: `2.36075`
*   **Actual Engine Result**: `2.36075`
*   **Status**: ✅ PASS

### Case 3: Dynamic Confidence (Updated)
*   **Input Data**: 25 weeks of data (Window size = 12)
*   **Logic**: Should use total history (25) instead of window size (12).
*   **Formula**: `min(25 / 20, 1.0)`
*   **Expected Confidence**: `1.0` (100%)
*   **Actual Engine Result**: `1.0`
*   **Status**: ✅ PASS

---

## 3. Conclusion

The `EngineV2` implementation is mathematically sound and follows the design specifications. The Confidence calculation correctly identifies the depth of historical data and reaches 100% after 20 weeks of valid data.

---

## 4. Automated Verification Harness (2026-08-20)

The previous proof script has been replaced by a repeatable harness under
`verification/` and automated tests under `tests/js/`.

The generator uses an explicit seed and known weekly effects. The suite checks:

- a controlled negative anomaly is detected at its known index;
- stable data stays below the configured false-positive tolerance;
- gaps remain explicit and do not poison EWMA/CUSUM state;
- NaN, Infinity, and an extreme finite value do not produce non-finite engine
  results;
- a result prefix is identical whether or not future weeks are present;
- a simple rolling mean/standard-deviation implementation provides an
  independent baseline comparison.

Run `npm test` for unit tests and `npm run verify` for a JSON scenario report in
the ignored `var/verification/` directory. `make verify` also runs all Python
security-tool tests when GNU Make and Python are available.

The harness is parameterized project verification, not a claim that one set of
synthetic cases validates every real deployment. Add owner-approved scenarios
and tolerances before changing alert thresholds or merging future core logic.
