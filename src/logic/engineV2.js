/**
 * EWS Algorithm Engine v2.0
 * 5-Layer Logic: Robust Baseline, EWMA, CUSUM, Conformal Prediction, Health Score.
 */

export const EngineV2 = {
    /**
     * Layer 1: Robust Baseline (RAW)
     * Calculates median and dispersion using a fallback chain.
     */
    calculateBaseline: (rawHistory, windowSize) => {
        const window = rawHistory.filter(v => v !== null).slice(-windowSize);
        const n = window.length;

        if (n === 0) {
            return { median: null, dispersion: 0, method: 'CONST', n: 0, confidence: 0 };
        }

        const sorted = [...window].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        // Dispersion Fallback Chain
        let dispersion = 0;
        let method = 'MAD';

        // 1. MAD
        const ad = window.map(v => Math.abs(v - median)).sort((a, b) => a - b);
        const mad = ad.length % 2 === 0
            ? (ad[ad.length / 2 - 1] + ad[ad.length / 2]) / 2
            : ad[Math.floor(ad.length / 2)];

        dispersion = mad;

        // 2. IQR
        if (dispersion === 0) {
            const q25 = sorted[Math.floor(n * 0.25)];
            const q75 = sorted[Math.floor(n * 0.75)];
            const iqr = (q75 - q25) / 1.353;
            if (iqr > 0) {
                dispersion = iqr;
                method = 'IQR';
            }
        }

        // 3. Range
        if (dispersion === 0) {
            const range = (sorted[n - 1] - sorted[0]) / 4.04;
            if (range > 0) {
                dispersion = range;
                method = 'RANGE';
            }
        }

        // 4. Fallback to 0
        if (dispersion === 0) {
            method = 'CONST';
        }

        const totalN = rawHistory.filter(v => v !== null).length;
        const confidence = Math.min(totalN / 20, 1.0);

        return { median, dispersion, method, n, confidence };
    },

    /**
     * Layer 2: Point Anomaly (EWMA on NEW only)
     * Maintains state S_t = alpha * X_t + (1 - alpha) * S_{t-1}
     */
    updateEWMA: (currentX, previousS, alpha) => {
        if (previousS === null) return currentX;
        return alpha * currentX + (1 - alpha) * previousS;
    },

    calculateZScore: (sVal, median, dispersion) => {
        if (dispersion === 0 || median === null) return 0;
        return 0.6745 * (sVal - median) / dispersion;
    },

    classifyAlert: (z, thresholds, polarity) => {
        let absZ = Math.abs(z);

        // Polarity filtering
        if (polarity === 'negative' && z > 0) return 'NORMAL';
        if (polarity === 'positive' && z < 0) return 'NORMAL';

        if (absZ >= thresholds.critical) return 'CRITICAL';
        if (absZ >= thresholds.warning) return 'WARNING';
        return 'NORMAL';
    },

    /**
     * Layer 3: CUSUM Drift Detection
     */
    updateCUSUM: (z, state, k, h) => {
        const s_pos = Math.max(0, state.s_pos + z - k);
        const s_neg = Math.max(0, state.s_neg - z - k);

        let drift = false;
        let direction = null;

        if (s_neg > h) {
            drift = true;
            direction = 'DECLINING';
        } else if (s_pos > h) {
            drift = true;
            direction = 'INCREASING';
        }

        return { s_pos, s_neg, drift, direction };
    },

    /**
     * Layer 4: Conformal Thresholds (Adaptive)
     */
    calculateConformalThresholds: (residuals, alpha_warn, alpha_crit) => {
        if (residuals.length < 8) {
            return {
                warning: 1.2,
                critical: 2.5,
                method: 'fallback'
            };
        }

        const sortedR = [...residuals].sort((a, b) => a - b);
        const n = sortedR.length;

        const getPercentile = (p) => {
            const idx = Math.ceil(p * n) - 1;
            return sortedR[Math.min(idx, n - 1)];
        };

        let warning = getPercentile(1 - alpha_warn);
        let critical = getPercentile(1 - alpha_crit);

        // Safety Floors
        warning = Math.max(warning, 0.8);
        critical = Math.max(critical, 1.5);

        return { warning, critical, method: 'conformal' };
    },

    /**
     * Layer 5: Health Score
     */
    calculateHealth: (z, alert) => {
        if (alert === 'NORMAL') return { score: 1.0, status: 'HEALTHY' };

        const severity = Math.min(Math.abs(z) / 3, 1.0);
        const health = 1.0 - severity;

        let status = 'HEALTHY';
        if (health < 0.4) status = 'CRITICAL';
        else if (health < 0.7) status = 'AT_RISK';

        return { score: health, status };
    }
};
