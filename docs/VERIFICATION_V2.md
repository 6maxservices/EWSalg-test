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
