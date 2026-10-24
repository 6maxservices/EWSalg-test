import { EngineV2 } from '../src/logic/engineV2.js';

export const DEFAULT_VERIFICATION_PARAMS = Object.freeze({
    alpha: 0.5,
    windowSize: 12,
    polarity: 'both',
    k: 0.5,
    h: 5,
    cusumOverride: true,
    alphaWarn: 0.1,
    alphaCrit: 0.02,
});

/** Execute the browser engine as a pure, no-future-leakage pipeline. */
export function runEngineV2(series, overrides = {}) {
    const params = { ...DEFAULT_VERIFICATION_PARAMS, ...overrides };
    let previousS = null;
    let cusum = { s_pos: 0, s_neg: 0, drift: false, direction: null };
    const residuals = [];
    const results = [];

    for (let index = 0; index < series.length; index += 1) {
        const point = series[index];
        if (point.isGap || !Number.isFinite(point.value)) {
            results.push({ ...point, sVal: null, z: null, alert: 'GAP' });
            continue;
        }
        const history = series.slice(0, index).map(item => item.value);
        const baseline = EngineV2.calculateBaseline(history, params.windowSize);
        previousS = EngineV2.updateEWMA(point.value, previousS, params.alpha);
        const thresholds = EngineV2.calculateConformalThresholds(residuals, params.alphaWarn, params.alphaCrit);
        const z = EngineV2.calculateZScore(previousS, baseline.median, baseline.dispersion);
        const pointAlert = EngineV2.classifyAlert(z, thresholds, params.polarity);
        cusum = EngineV2.updateCUSUM(z, cusum, params.k, params.h);
        const alert = params.cusumOverride && cusum.drift && pointAlert === 'NORMAL' ? 'WARNING' : pointAlert;
        if (Number.isFinite(z) && z !== 0) residuals.push(Math.abs(z));
        results.push({
            ...point,
            ...baseline,
            sVal: previousS,
            z,
            alert,
            pointAlert,
            cusum: { ...cusum },
            thresholds: { ...thresholds },
            health: EngineV2.calculateHealth(z, alert),
        });
    }
    return results;
}
