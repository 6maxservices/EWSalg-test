import assert from 'node:assert/strict';
import test from 'node:test';

import { DataService } from '../../src/logic/data.js';

test('CSV parsing rejects NaN and infinite values', () => {
    const rows = DataService.parseCSV('date,value\n2026-01-05,10\n2026-01-06,NaN\n2026-01-07,Infinity');
    assert.deepEqual(rows, [{ date: '2026-01-05', value: '10' }]);
});

test('weekly sequence inserts an explicit gap using UTC dates', () => {
    const result = DataService.ensureWeeklySequence([
        { date: '2026-01-05', value: 10 },
        { date: '2026-01-19', value: 12 },
    ]);
    assert.deepEqual(result[1], { date: '2026-01-12', value: null, isGap: true });
});
