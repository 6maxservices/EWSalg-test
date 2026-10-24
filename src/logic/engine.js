/**
 * EWS Algorithm Engine
 * EWMA, Rolling Baseline (Median/MAD), Z-Score, Alerting.
 */

export const Engine = {
    /**
     * Compute EWMA for the series. Skips gaps.
     */
    computeEWMA: (series, alpha) => {
        if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
            throw new RangeError('alpha must be in the interval (0, 1]');
        }
        let s = null;
        return series.map(point => {
            if (!Number.isFinite(point.value)) return { ...point, ewma: null };

            if (s === null) {
                s = point.value;
            } else {
                s = alpha * point.value + (1 - alpha) * s;
            }
            return { ...point, ewma: s };
        });
    },

    /**
     * Calculate Rolling Baseline using ONLY weeks < t.
     */
    calculateBaseline: (series, windowSize, currentTIdx) => {
        // Look back from t-1
        const window = [];
        const bounds = { start: null, end: null };

        let i = currentTIdx - 1;
        while (i >= 0 && window.length < windowSize) {
            if (Number.isFinite(series[i].ewma)) {
                window.push(series[i].ewma);
                if (!bounds.end) bounds.end = series[i].date;
                bounds.start = series[i].date;
            }
            i--;
        }

        if (window.length < windowSize) {
            return { median: null, mad: null, ...bounds };
        }

        const sorted = [...window].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        const absoluteDeviations = window.map(v => Math.abs(v - median)).sort((a, b) => a - b);
        const mad = absoluteDeviations.length % 2 === 0
            ? (absoluteDeviations[absoluteDeviations.length / 2 - 1] + absoluteDeviations[absoluteDeviations.length / 2]) / 2
            : absoluteDeviations[Math.floor(absoluteDeviations.length / 2)];

        return { median, mad, windowStart: bounds.start, windowEnd: bounds.end };
    },

    /**
     * Modified Z-score calculation.
     */
    calculateZScore: (value, median, mad) => {
        if (!Number.isFinite(value) || !Number.isFinite(median) || !Number.isFinite(mad) || mad <= 0) return 0;
        return 0.6745 * (value - median) / mad;
    },

    /**
     * Classify alert level based on Z-score and thresholds.
     */
    classify: (z, thresholds) => {
        if (!Number.isFinite(z)) return 'NORMAL';
        const critical = Number.isFinite(thresholds?.critical) ? thresholds.critical : -2.5;
        const warning = Number.isFinite(thresholds?.warning) ? thresholds.warning : -1.2;
        const positiveSpike = Number.isFinite(thresholds?.positiveSpike) ? thresholds.positiveSpike : 2.5;
        if (z <= critical) return 'CRITICAL';
        if (z <= warning) return 'WARNING';
        if (z >= positiveSpike) return 'POSITIVE_SPIKE';
        return 'NORMAL';
    },

    /**
     * Update freeze state machine.
     * frozen = true if last N weeks z <= warning_threshold.
     * frozen = false if z > warning_threshold.
     */
    updateFreezeState: (z, previousConsecutiveLow, nThreshold, warningThreshold) => {
        if (!Number.isFinite(z) || !Number.isFinite(warningThreshold)) {
            return { consecutiveLow: 0, frozen: false };
        }
        const prior = Number.isInteger(previousConsecutiveLow) && previousConsecutiveLow >= 0 ? previousConsecutiveLow : 0;
        const threshold = Number.isInteger(nThreshold) && nThreshold > 0 ? nThreshold : 1;
        if (z <= warningThreshold) {
            const consecutive = prior + 1;
            return {
                consecutiveLow: consecutive,
                frozen: consecutive >= threshold
            };
        } else {
            return {
                consecutiveLow: 0,
                frozen: false
            };
        }
    }
};
