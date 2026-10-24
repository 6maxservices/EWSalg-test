import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runReferenceZScore } from './baseline.js';
import { runEngineV2 } from './runEngineV2.js';
import { generateSyntheticSeries } from './synthetic.js';

function alerted(result) {
    return result.alert === 'WARNING' || result.alert === 'CRITICAL';
}

export function runVerification() {
    const anomalyIndex = 32;
    const anomalySeries = generateSyntheticSeries({
        length: 52,
        noiseStd: 0.7,
        seed: 11,
        anomalies: [{ index: anomalyIndex, effect: -25 }],
    });
    const stableSeries = generateSyntheticSeries({ length: 80, noiseStd: 0.4, seed: 17 });
    const edgeSeries = generateSyntheticSeries({
        length: 50,
        noiseStd: 0.5,
        seed: 23,
        anomalies: [{ index: 35, effect: -1_000_000 }],
        missingIndices: [5, 18, 19],
    });

    const engineAnomaly = runEngineV2(anomalySeries);
    const referenceAnomaly = runReferenceZScore(anomalySeries);
    const engineStable = runEngineV2(stableSeries);
    const engineEdge = runEngineV2(edgeSeries);

    const stableEvaluation = engineStable.slice(20);
    const falsePositiveRate = stableEvaluation.filter(alerted).length / stableEvaluation.length;
    const scenarios = [
        {
            name: 'known-negative-anomaly',
            pass: alerted(engineAnomaly[anomalyIndex]),
            details: { engineAlert: engineAnomaly[anomalyIndex].alert, referenceAlert: referenceAnomaly[anomalyIndex].alert },
        },
        {
            name: 'stable-series-false-positive-rate',
            pass: falsePositiveRate <= 0.10,
            details: { tolerance: 0.10, actual: falsePositiveRate },
        },
        {
            name: 'missing-values-and-extreme-value',
            pass: edgeSeries.every((point, index) => point.isGap ? engineEdge[index].alert === 'GAP' : Number.isFinite(engineEdge[index].z)),
            details: { gapCount: edgeSeries.filter(point => point.isGap).length },
        },
        {
            name: 'no-future-data-leakage',
            pass: JSON.stringify(runEngineV2(anomalySeries.slice(0, anomalyIndex))) === JSON.stringify(engineAnomaly.slice(0, anomalyIndex)),
            details: { comparedWeeks: anomalyIndex },
        },
    ];

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        status: scenarios.every(item => item.pass) ? 'PASS' : 'FAIL',
        scenarios,
    };
}

function main() {
    const report = runVerification();
    const outputFlag = process.argv.indexOf('--output');
    if (outputFlag >= 0 && process.argv[outputFlag + 1]) {
        const output = path.resolve(process.argv[outputFlag + 1]);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
