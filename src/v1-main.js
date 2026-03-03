import { DataService } from './logic/data.js';
import { Engine } from './logic/engine.js';
import { TabService } from './ui/tabs.js';
import { ChartService } from './ui/charts.js';
import { RunService } from './logic/runs.js';
import { MetricService } from './logic/metrics.js';

// --- State Management ---
let state = {
    rawSeries: [],      // [{date, value, isGap}] - the full weekly sequence
    processedSeries: [], // [{date, value, ewma, ...}] - enriched during playback
    currentIndex: 0,
    isPlaying: false,
    playInterval: null,
    datasetFingerprint: null,
    freezeState: { consecutiveLow: 0, frozen: false },
    events: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    TabService.init();
    ChartService.init('chart-main', 'chart-zscore');
    setupEventListeners();
    renderRunsList();
});

function setupEventListeners() {
    // CSV Upload
    document.getElementById('csv-upload').addEventListener('change', handleFileUpload);

    // Events Upload
    document.getElementById('events-upload').addEventListener('change', handleEventsUpload);

    // Playback Controls
    document.getElementById('btn-step').addEventListener('click', () => step());
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-reset').addEventListener('click', resetPlayback);
    document.getElementById('btn-save-run').addEventListener('click', handleSaveRun);

    // Slider
    document.getElementById('playback-slider').addEventListener('input', (e) => {
        state.currentIndex = parseInt(e.target.value);
        runToCurrent();
    });

    // Run Controls
    document.getElementById('btn-export-runs').addEventListener('click', () => RunService.exportRuns());
    document.getElementById('btn-import-runs').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (f) => {
                if (RunService.importRuns(f.target.result)) {
                    showToast('Runs imported successfully');
                    renderRunsList();
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

// --- File Handling ---
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
        const csvData = f.target.result;
        const parsed = DataService.parseCSV(csvData);

        const aggMethod = document.getElementById('agg-method').value;
        let weekly = aggMethod === 'NONE' ? parsed : DataService.aggregateToWeekly(parsed, aggMethod);

        state.rawSeries = DataService.ensureWeeklySequence(weekly);
        state.datasetFingerprint = DataService.getFingerprint(state.rawSeries);

        document.getElementById('dataset-info').textContent = `Loaded: ${file.name} (${state.rawSeries.length} weeks)`;
        document.getElementById('data-preview-panel').style.display = 'block';
        renderDataPreview();
        resetPlayback();
        showToast('Dataset loaded successfully');
    };
    reader.readAsText(file);
}

// --- Playback Engine ---
function resetPlayback() {
    state.currentIndex = 0;
    state.processedSeries = [];
    state.freezeState = { consecutiveLow: 0, frozen: false };
    state.isPlaying = false;
    clearInterval(state.playInterval);
    document.getElementById('btn-play').textContent = 'Play';

    const slider = document.getElementById('playback-slider');
    slider.max = state.rawSeries.length - 1;
    slider.value = 0;

    if (state.rawSeries.length > 0) {
        document.getElementById('start-date').textContent = state.rawSeries[0].date;
        document.getElementById('end-date').textContent = state.rawSeries[state.rawSeries.length - 1].date;
    }

    ChartService.clear();
    renderSignalLog();
    updateTimelineDisplay();
}

function step() {
    if (state.currentIndex >= state.rawSeries.length - 1) {
        pause();
        return;
    }
    state.currentIndex++;
    document.getElementById('playback-slider').value = state.currentIndex;
    runToCurrent();
}

function runToCurrent() {
    const paramsV1 = getParams();
    state.processedSeries = [];
    state.freezeState = { consecutiveLow: 0, frozen: false };

    const seriesWithEWMAV1 = Engine.computeEWMA(state.rawSeries, paramsV1.alpha);

    for (let t = 0; t <= state.currentIndex; t++) {
        const pointV1 = seriesWithEWMAV1[t];
        if (pointV1.isGap) {
            state.processedSeries.push({ ...pointV1, z: null, alert: 'GAP', baseline: null });
        } else {
            const baselineV1 = Engine.calculateBaseline(seriesWithEWMAV1, paramsV1.windowSize, t);
            if (t < paramsV1.warmupWeeks) {
                state.processedSeries.push({ ...pointV1, z: null, alert: 'WARMUP', ...baselineV1 });
            } else {
                let effectiveBaselineV1 = { ...baselineV1 };
                if (state.freezeState.frozen) {
                    const lastNormal = [...state.processedSeries].reverse().find(p => !p.frozen);
                    if (lastNormal) {
                        effectiveBaselineV1.median = lastNormal.median;
                        effectiveBaselineV1.mad = lastNormal.mad;
                    }
                }
                const zV1 = Engine.calculateZScore(pointV1.ewma, effectiveBaselineV1.median, effectiveBaselineV1.mad);
                const alertV1 = Engine.classify(zV1, paramsV1);
                state.freezeState = Engine.updateFreezeState(zV1, state.freezeState.consecutiveLow, paramsV1.freezeN, paramsV1.warning);
                state.processedSeries.push({ ...pointV1, ...effectiveBaselineV1, z: zV1, alert: alertV1, frozen: state.freezeState.frozen });
            }
        }
    }

    updateVisuals();
    updateTimelineDisplay();
}

function updateVisuals() {
    const labelsV1 = state.processedSeries.map(p => p.date);
    const rawV1 = state.processedSeries.map(p => p.value);
    const ewmaV1 = state.processedSeries.map(p => p.ewma);
    const mediansV1 = state.processedSeries.map(p => p.median);
    const zScoresV1 = state.processedSeries.map(p => p.z);
    ChartService.update(labelsV1, rawV1, ewmaV1, mediansV1, zScoresV1, getParams(), false);

    renderSignalLog();
    updateValidation();
}

function updateTimelineDisplay() {
    const current = state.rawSeries[state.currentIndex];
    if (current) {
        document.getElementById('current-date').textContent = current.date;
    }
}

function togglePlay() {
    if (state.isPlaying) pause(); else play();
}

function play() {
    state.isPlaying = true;
    document.getElementById('btn-play').textContent = 'Pause';
    state.playInterval = setInterval(() => {
        if (state.currentIndex >= state.rawSeries.length - 1) {
            pause();
        } else {
            step();
        }
    }, 500);
}

function pause() {
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = 'Play';
    clearInterval(state.playInterval);
}

function getParams() {
    return {
        alpha: parseFloat(document.getElementById('param-alpha').value),
        windowSize: parseInt(document.getElementById('param-window').value),
        warning: parseFloat(document.getElementById('param-warn').value),
        critical: parseFloat(document.getElementById('param-crit').value),
        positiveSpike: 2.5,
        freezeN: parseInt(document.getElementById('param-freeze-n').value),
        warmupWeeks: parseInt(document.getElementById('param-warmup').value),
    };
}

function renderDataPreview() {
    const tbody = document.querySelector('#data-preview-table tbody');
    tbody.innerHTML = '';
    state.rawSeries.slice(0, 10).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.date}</td><td>${row.value ?? '-'}</td><td>${row.isGap ? '<span style="color:var(--critical)">GAP</span>' : 'OK'}</td>`;
        tbody.appendChild(tr);
    });
}

function renderSignalLog() {
    const tbody = document.querySelector('#signal-log-table tbody');
    tbody.innerHTML = '';
    [...state.processedSeries].reverse().slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.value?.toFixed(2) ?? '-'}</td>
      <td>${row.ewma?.toFixed(2) ?? '-'}</td>
      <td>${row.median?.toFixed(2) ?? '-'}</td>
      <td>${row.mad?.toFixed(2) ?? '-'}</td>
      <td>${row.windowStart ?? '-'}</td>
      <td>${row.windowEnd ?? '-'}</td>
      <td>${row.z?.toFixed(2) ?? '-'}</td>
      <td><span class="alert-tag alert-${row.alert}">${row.alert}</span></td>
      <td>${row.frozen ? 'YES' : 'No'}</td>
    `;
        tbody.appendChild(tr);
    });
}

function renderRunsList() {
    const container = document.getElementById('runs-list');
    const runs = RunService.getAllRuns();
    container.innerHTML = runs.length ? '' : '<p style="color:var(--text-dim)">No runs saved yet.</p>';

    runs.forEach(run => {
        const div = document.createElement('div');
        div.className = 'panel';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.innerHTML = `
      <div>
        <strong>${run.name}</strong><br>
        <small style="color:var(--text-dim)">${new Date(run.timestamp).toLocaleString()} | α=${run.params.alpha} | W=${run.params.windowSize}</small>
      </div>
      <button class="btn-primary" style="background:var(--critical)" onclick="window.deleteRun('${run.id}')">Delete</button>
    `;
        container.appendChild(div);
    });
}

window.deleteRun = (id) => {
    RunService.deleteRun(id);
    renderRunsList();
};

function handleEventsUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
        const csvData = f.target.result;
        const events = DataService.parseCSV(csvData);
        state.events = events;
        showToast(`Loaded ${events.length} events`);
        updateValidation();
    };
    reader.readAsText(file);
}

function updateValidation() {
    if (!state.processedSeries.length || !state.events) return;

    const results = MetricService.calculate(state.processedSeries, state.events);
    if (results) {
        document.getElementById('metric-precision').textContent = (results.precision * 100).toFixed(1) + '%';
        document.getElementById('metric-recall').textContent = (results.recall * 100).toFixed(1) + '%';
        document.getElementById('metric-lead').textContent = results.avgLeadTime.toFixed(1) + ' wks';
    }
}

function handleSaveRun() {
    if (state.processedSeries.length === 0) return;
    const name = prompt('Run name:', `Run ${new Date().toLocaleTimeString()}`);
    if (!name) return;

    RunService.saveRun(name, getParams(), state.processedSeries, state.datasetFingerprint);
    renderRunsList();
    showToast('Run saved!');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
