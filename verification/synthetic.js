/** Reproducible synthetic weekly datasets with known EWS events. */

export function createSeededRandom(seed = 42) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gaussian(random) {
    const u = Math.max(random(), Number.EPSILON);
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateSyntheticSeries({
    length = 52,
    baseline = 100,
    noiseStd = 1,
    seed = 42,
    startDate = '2026-01-05',
    anomalies = [],
    drift = null,
    missingIndices = [],
} = {}) {
    if (!Number.isInteger(length) || length <= 0) throw new RangeError('length must be a positive integer');
    const random = createSeededRandom(seed);
    const missing = new Set(missingIndices);
    const anomalyByIndex = new Map(anomalies.map(item => [item.index, item.effect]));
    const start = new Date(`${startDate}T00:00:00Z`);

    return Array.from({ length }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index * 7);
        if (missing.has(index)) {
            return { date: date.toISOString().slice(0, 10), value: null, isGap: true };
        }
        const driftEffect = drift && index >= drift.start ? (index - drift.start + 1) * drift.slope : 0;
        const anomalyEffect = anomalyByIndex.get(index) ?? 0;
        const value = baseline + gaussian(random) * noiseStd + driftEffect + anomalyEffect;
        return { date: date.toISOString().slice(0, 10), value, isGap: false };
    });
}
