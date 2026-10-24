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
        if (!Array.isArray(rawHistory)) throw new TypeError('rawHistory must be an array');
        if (!Number.isInteger(windowSize) || windowSize <= 0) throw new RangeError('windowSize must be a positive integer');
        const finiteHistory = rawHistory.filter(Number.isFinite);
        const window = finiteHistory.slice(-windowSize);
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

        const totalN = finiteHistory.length;
        const confidence = Math.min(totalN / 20, 1.0);

        return { median, dispersion, method, n, confidence };
    },

    /**
     * Layer 2: Point Anomaly (EWMA on NEW only)
     * Maintains state S_t = alpha * X_t + (1 - alpha) * S_{t-1}
     */
    updateEWMA: (currentX, previousS, alpha) => {
        if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
            throw new RangeError('alpha must be in the interval (0, 1]');
        }
        if (!Number.isFinite(currentX)) return Number.isFinite(previousS) ? previousS : null;
        if (!Number.isFinite(previousS)) return currentX;
        return alpha * currentX + (1 - alpha) * previousS;
    },

    calculateZScore: (sVal, median, dispersion) => {
        if (!Number.isFinite(sVal) || !Number.isFinite(median) || !Number.isFinite(dispersion) || dispersion <= 0) return 0;
        return 0.6745 * (sVal - median) / dispersion;
    },

    classifyAlert: (z, thresholds, polarity) => {
        if (!Number.isFinite(z)) return 'NORMAL';
        let absZ = Math.abs(z);
        const warning = Number.isFinite(thresholds?.warning) && thresholds.warning > 0 ? thresholds.warning : 1.2;
        const critical = Number.isFinite(thresholds?.critical) && thresholds.critical > 0 ? thresholds.critical : 2.5;

        // Polarity filtering
        if (polarity === 'negative' && z > 0) return 'NORMAL';
        if (polarity === 'positive' && z < 0) return 'NORMAL';

        if (absZ >= critical) return 'CRITICAL';
        if (absZ >= warning) return 'WARNING';
        return 'NORMAL';
    },

    /**
     * Layer 3: CUSUM Drift Detection
     */
    updateCUSUM: (z, state, k, h) => {
        const safeZ = Number.isFinite(z) ? z : 0;
        const safeK = Number.isFinite(k) && k >= 0 ? k : 0;
        const safeH = Number.isFinite(h) && h >= 0 ? h : Infinity;
        const previousPositive = Number.isFinite(state?.s_pos) ? state.s_pos : 0;
        const previousNegative = Number.isFinite(state?.s_neg) ? state.s_neg : 0;
        const s_pos = Math.max(0, previousPositive + safeZ - safeK);
        const s_neg = Math.max(0, previousNegative - safeZ - safeK);

        let drift = false;
        let direction = null;

        if (s_neg > safeH) {
            drift = true;
            direction = 'DECLINING';
        } else if (s_pos > safeH) {
            drift = true;
            direction = 'INCREASING';
        }

        return { s_pos, s_neg, drift, direction };
    },

    /**
     * Layer 4: Conformal Thresholds (Adaptive)
     */
    calculateConformalThresholds: (residuals, alpha_warn, alpha_crit) => {
        const finiteResiduals = Array.isArray(residuals)
            ? residuals.filter(value => Number.isFinite(value) && value >= 0)
            : [];
        if (finiteResiduals.length < 8) {
            return {
                warning: 1.2,
                critical: 2.5,
                method: 'fallback'
            };
        }

        const safeAlphaWarn = Number.isFinite(alpha_warn) && alpha_warn > 0 && alpha_warn < 1 ? alpha_warn : 0.1;
        const safeAlphaCrit = Number.isFinite(alpha_crit) && alpha_crit > 0 && alpha_crit < 1 ? alpha_crit : 0.02;
        const sortedR = [...finiteResiduals].sort((a, b) => a - b);
        const n = sortedR.length;

        const getPercentile = (p) => {
            const idx = Math.ceil(p * n) - 1;
            return sortedR[Math.min(idx, n - 1)];
        };

        let warning = getPercentile(1 - safeAlphaWarn);
        let critical = getPercentile(1 - safeAlphaCrit);

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

        const severity = Number.isFinite(z) ? Math.min(Math.abs(z) / 3, 1.0) : 1.0;
        const health = 1.0 - severity;

        let status = 'HEALTHY';
        if (health < 0.4) status = 'CRITICAL';
        else if (health < 0.7) status = 'AT_RISK';

        return { score: health, status };
    }
};
