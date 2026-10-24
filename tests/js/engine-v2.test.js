import assert from 'node:assert/strict';
import test from 'node:test';

import { EngineV2 } from '../../src/logic/engineV2.js';
import { Engine } from '../../src/logic/engine.js';
import { runEngineV2 } from '../../verification/runEngineV2.js';
import { generateSyntheticSeries } from '../../verification/synthetic.js';
import { runVerification } from '../../verification/verify.js';

test('baseline ignores null, NaN and infinite values', () => {
    const result = EngineV2.calculateBaseline([10, null, Number.NaN, 12, Infinity, 11], 3);
    assert.equal(result.median, 11);
    assert.equal(result.n, 3);
    assert.equal(result.confidence, 3 / 20);
});

test('EWMA rejects an invalid alpha and does not propagate NaN', () => {
    assert.throws(() => EngineV2.updateEWMA(10, null, 0), RangeError);
    assert.equal(EngineV2.updateEWMA(Number.NaN, 8, 0.5), 8);
    assert.equal(EngineV2.updateEWMA(10, null, 0.5), 10);
});

test('CUSUM and health remain finite for malformed numeric input', () => {
    const cusum = EngineV2.updateCUSUM(Number.NaN, { s_pos: Number.NaN, s_neg: 0 }, 0.5, 5);
    assert.ok(Number.isFinite(cusum.s_pos));
    assert.ok(Number.isFinite(cusum.s_neg));
    assert.deepEqual(EngineV2.calculateHealth(Number.NaN, 'CRITICAL'), { score: 0, status: 'CRITICAL' });
});

test('synthetic generation is reproducible and gaps do not poison the engine', () => {
    const options = { length: 30, seed: 99, missingIndices: [4, 11] };
    const first = generateSyntheticSeries(options);
    const second = generateSyntheticSeries(options);
    assert.deepEqual(first, second);
    const results = runEngineV2(first);
    assert.equal(results[4].alert, 'GAP');
    assert.ok(results.filter(result => result.alert !== 'GAP').every(result => Number.isFinite(result.z)));
});

test('verification harness passes its controlled scenarios', () => {
    const report = runVerification();
    assert.equal(report.status, 'PASS', JSON.stringify(report, null, 2));
});

test('V1 engine treats non-finite values as gaps', () => {
    const values = Engine.computeEWMA(
        [{ value: 10 }, { value: Number.NaN }, { value: 12 }],
        0.5,
    );
    assert.equal(values[1].ewma, null);
    assert.equal(values[2].ewma, 11);
    assert.equal(Engine.calculateZScore(Number.NaN, 10, 2), 0);
});
