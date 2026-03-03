/**
 * Run Persistence and Comparison
 */

export const RunService = {
    SAVE_KEY: 'ews_playback_runs',

    /**
     * Save a run to localStorage.
     */
    saveRun: (name, params, results, fingerprint) => {
        const runs = RunService.getAllRuns();
        const newRun = {
            id: Date.now().toString(),
            name,
            timestamp: new Date().toISOString(),
            params,
            results,
            fingerprint
        };
        runs.push(newRun);
        localStorage.setItem(RunService.SAVE_KEY, JSON.stringify(runs));
        return newRun;
    },

    getAllRuns: () => {
        const data = localStorage.getItem(RunService.SAVE_KEY);
        return data ? JSON.parse(data) : [];
    },

    deleteRun: (id) => {
        let runs = RunService.getAllRuns();
        runs = runs.filter(r => r.id !== id);
        localStorage.setItem(RunService.SAVE_KEY, JSON.stringify(runs));
    },

    exportRuns: () => {
        const runs = RunService.getAllRuns();
        const blob = new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ews_runs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    importRuns: (jsonString) => {
        try {
            const imported = JSON.parse(jsonString);
            if (!Array.isArray(imported)) throw new Error('Invalid format');
            // Merge with existing or overwrite? Let's overwrite for simplicity as per MVP.
            localStorage.setItem(RunService.SAVE_KEY, JSON.stringify(imported));
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    },

    /**
     * Compare two runs. Returns delta object.
     */
    compare: (runA, runB) => {
        if (runA.fingerprint !== runB.fingerprint) {
            return { error: 'Dataset mismatch! Fingerprints do not match.' };
        }

        const getAlertCounts = (results) => {
            const counts = { CRITICAL: 0, WARNING: 0, POSITIVE_SPIKE: 0 };
            results.forEach(r => {
                if (counts[r.alert]) counts[r.alert]++;
            });
            return counts;
        };

        const countsA = getAlertCounts(runA.results);
        const countsB = getAlertCounts(runB.results);

        return {
            statsA: countsA,
            statsB: countsB,
            paramsA: runA.params,
            paramsB: runB.params
        };
    }
};
