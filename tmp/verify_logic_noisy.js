import { Engine } from '../src/logic/engine.js';

async function testEWSNoisy() {
    console.log("--- EWS Logic Verification (Noisy Data) ---");

    const data = [];
    const baselineMean = 100;
    const noise = [2, -1, 3, 0, -2, 1, -3, 2, -1, 0, 2, -1]; // 12 weeks of noise

    // Weeks 0-11: Normal with noise (MAD > 0)
    for (let i = 0; i < 12; i++) {
        let val = baselineMean + noise[i];
        data.push({ date: `2024-W${i + 1}`, value: val, ewma: val });
    }

    // Weeks 12-14: Sustained Drop (Value 50)
    for (let i = 12; i < 15; i++) {
        data.push({ date: `2024-W${i + 1}`, value: 50, ewma: 50 });
    }

    // Weeks 15-18: Flat (Value 50) -> Should be FROZEN
    for (let i = 15; i < 19; i++) {
        data.push({ date: `2024-W${i + 1}`, value: 50, ewma: 50 });
    }

    const params = {
        alpha: 0.3,
        windowSize: 12,
        warning: -1.2,
        critical: -2.5,
        freezeN: 3,
        warmupWeeks: 8
    };

    let freezeState = { consecutiveLow: 0, frozen: false };
    let processed = [];

    console.log("Week | Value | Median | MAD | Z-Score | Alert | Frozen");
    console.log("---------------------------------------------------------");

    for (let t = 0; t < data.length; t++) {
        const point = data[t];
        const baseline = Engine.calculateBaseline(data.slice(0, t + 1), params.windowSize, t);

        let effectiveMedian = baseline.median;
        let effectiveMad = baseline.mad;

        if (freezeState.frozen) {
            const lastNormal = [...processed].reverse().find(p => !p.frozen);
            if (lastNormal) {
                effectiveMedian = lastNormal.median;
                effectiveMad = lastNormal.mad;
            }
        }

        const z = Engine.calculateZScore(point.ewma, effectiveMedian, effectiveMad);
        const alert = Engine.classify(z, params);
        const nextFreeze = Engine.updateFreezeState(z, freezeState.consecutiveLow, params.freezeN, params.warning);

        console.log(`${t.toString().padStart(4)} | ${point.value.toString().padStart(5)} | ${String(effectiveMedian).padStart(6)} | ${String(effectiveMad).padStart(3)} | ${z.toFixed(2).padStart(7)} | ${alert.padEnd(14)} | ${freezeState.frozen}`);

        processed.push({ ...point, median: effectiveMedian, mad: effectiveMad, z, alert, frozen: freezeState.frozen });
        freezeState = nextFreeze;
    }

    console.log("\n--- Technical Audit ---");
    const w12 = processed[12];
    console.log(`Week 12 (First Drop): Value=50, Baseline Median=${w12.median}, MAD=${w12.mad}, Z=${w12.z.toFixed(2)} -> ${w12.alert}`);

    const w15 = processed[15];
    console.log(`Week 15 (First Frozen week): Frozen=${w15.frozen}. Median locked to ${w15.median} (Previous: ${processed[14].median})`);

    if (w15.frozen && w15.median === processed[14].median) {
        console.log("VERIFIED: Freeze mechanism prevents baseline drift into anomalies.");
    }
}

testEWSNoisy();
