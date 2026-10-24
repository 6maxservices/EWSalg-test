/** Simple rolling mean/std reference implementation for comparison only. */

export function runReferenceZScore(series, { windowSize = 12, threshold = 3 } = {}) {
    return series.map((point, index) => {
        if (point.isGap || !Number.isFinite(point.value)) return { ...point, z: null, alert: 'GAP' };
        const history = series
            .slice(Math.max(0, index - windowSize), index)
            .map(item => item.value)
            .filter(Number.isFinite);
        if (history.length < windowSize) return { ...point, z: 0, alert: 'NORMAL' };
        const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
        const variance = history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length;
        const standardDeviation = Math.sqrt(variance);
        const z = standardDeviation > 0 ? (point.value - mean) / standardDeviation : 0;
        return { ...point, z, alert: Math.abs(z) >= threshold ? 'WARNING' : 'NORMAL' };
    });
}
