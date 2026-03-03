import { Engine } from '../src/logic/engine.js';

/**
 * Proof of Work: Baseline & Freeze Logic Verification
 * This script simulates a scenario and verifies outputs against expected values.
 */

async function testEWS() {
    console.log("--- EWS Logic Verification ---");

    // 1. Data Setup (20 weeks)
    // Weeks 0-11: Normal (Value 100)
    // Weeks 12-14: Drop (Value 50) -> Should trigger WARNING then CRITICAL
    // Weeks 15-18: Frozen (Value 50) -> Baseline should NOT update
    // Week 19: Recovery (Value 100) -> Should unfreeze
    const data = [];
    for (let i = 0; i < 20; i++) {
        let val = (i >= 12 && i <= 18) ? 50 : 100;
        data.push({ date: `2024-W${i + 1}`, value: val, ewma: val }); // Pre-filled EWMA for simplicity
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

        // Baseline (Weeks < t)
        const baseline = Engine.calculateBaseline(data.slice(0, t + 1), params.windowSize, t);

        // Effective Baseline (Handling Freeze)
        let effectiveMedian = baseline.median;
        let effectiveMad = baseline.mad;

        if (freezeState.frozen) {
            const lastNormal = [...processed].reverse().find(p => !p.frozen);
            if (lastNormal) {
                effectiveMedian = lastNormal.median;
                effectiveMad = lastNormal.mad;
            }
        }

        let z = 0;
        if (effectiveMedian !== null && effectiveMad !== null) {
            z = Engine.calculateZScore(point.ewma, effectiveMedian, effectiveMad);
        }

        const alert = Engine.classify(z, params);

        // Update Freeze State
        const nextFreeze = Engine.updateFreezeState(z, freezeState.consecutiveLow, params.freezeN, params.warning);

        console.log(`${t.toString().padStart(4)} | ${point.value.toString().padStart(5)} | ${String(effectiveMedian).padStart(6)} | ${String(effectiveMad).padStart(3)} | ${z.toFixed(2).padStart(7)} | ${alert.padEnd(10)} | ${freezeState.frozen}`);

        processed.push({ ...point, median: effectiveMedian, mad: effectiveMad, z, alert, frozen: freezeState.frozen });
        freezeState = nextFreeze;
    }

    // Verification Points
    const week12 = processed[12];
    const week15 = processed[15];

    console.log("\n--- Verification Highlights ---");
    console.log(`Week 12 (Drop start): Z=${week12.z.toFixed(2)} (Expected significant negative)`);
    console.log(`Week 15 (Freeze Start?): Frozen=${week15.frozen} (Expected true if 12,13,14 were low)`);

    if (week15.frozen && processed[15].median === processed[14].median) {
        console.log("SUCCESS: Baseline frozen and locked to last computed value.");
    } else if (week15.frozen) {
        console.log("CHECK: Frozen but median changed? Inspect logic.");
        console.log(`W14 Median: ${processed[14].median}, W15 Median: ${processed[15].median}`);
    }
}

testEWS();
