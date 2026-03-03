import { DataService } from './logic/data.js';
import { TabService } from './ui/tabs.js';
import { ChartService } from './ui/charts.js';
import { MetricService } from './logic/metrics.js';
import { EngineV2 } from './logic/engineV2.js';

// --- State Management ---
let state = {
    rawSeries: [],
    currentIndex: 0,
    isPlaying: false,
    playInterval: null,
    v2State: {
        previousS: null,
        cusum: { s_pos: 0, s_neg: 0, drift: false, direction: null },
        residuals: []
    },
    processedSeriesV2: [],
    events: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    TabService.init();
    ChartService.init('v2-chart-main', 'v2-chart-zscore', true);
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('csv-upload').addEventListener('change', handleFileUpload);
    document.getElementById('events-upload').addEventListener('change', handleEventsUpload);

    document.getElementById('btn-step-v2').addEventListener('click', () => step());
    document.getElementById('btn-play-v2').addEventListener('click', togglePlay);
    document.getElementById('btn-reset-v2').addEventListener('click', resetPlayback);

    document.getElementById('btn-reset-cusum').addEventListener('click', () => {
        state.v2State.cusum = { s_pos: 0, s_neg: 0, drift: false, direction: null };
        runToCurrent();
        showToast('CUSUM state reset');
    });

    document.getElementById('playback-slider-v2').addEventListener('input', (e) => {
        state.currentIndex = parseInt(e.target.value);
        runToCurrent();
    });
}

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

        document.getElementById('dataset-info').textContent = `Loaded: ${file.name} (${state.rawSeries.length} weeks)`;
        document.getElementById('data-preview-panel').style.display = 'block';
        renderDataPreview();
        resetPlayback();
        showToast('Dataset loaded successfully');
    };
    reader.readAsText(file);
}

function resetPlayback() {
    state.currentIndex = 0;
    state.processedSeriesV2 = [];
    state.v2State = {
        previousS: null,
        cusum: { s_pos: 0, s_neg: 0, drift: false, direction: null },
        residuals: []
    };
    state.isPlaying = false;
    clearInterval(state.playInterval);
    document.getElementById('btn-play-v2').textContent = 'Play';

    const slider = document.getElementById('playback-slider-v2');
    slider.max = state.rawSeries.length - 1;
    slider.value = 0;

    if (state.rawSeries.length > 0) {
        document.getElementById('start-date-v2').textContent = state.rawSeries[0].date;
        document.getElementById('end-date-v2').textContent = state.rawSeries[state.rawSeries.length - 1].date;
    }

    ChartService.clear();
    renderSignalLogV2();
    updateTimelineDisplay();
}

function step() {
    if (state.currentIndex >= state.rawSeries.length - 1) {
        pause();
        return;
    }
    state.currentIndex++;
    document.getElementById('playback-slider-v2').value = state.currentIndex;
    runToCurrent();
}

function runToCurrent() {
    const paramsV2 = getParamsV2();
    state.processedSeriesV2 = [];
    state.v2State = {
        previousS: null,
        cusum: { s_pos: 0, s_neg: 0, drift: false, direction: null },
        residuals: []
    };

    for (let t = 0; t <= state.currentIndex; t++) {
        const rawPoint = state.rawSeries[t];

        if (rawPoint.isGap) {
            state.processedSeriesV2.push({ ...rawPoint, sVal: null, z: null, alert: 'GAP' });
            continue;
        }

        const baselineV2 = EngineV2.calculateBaseline(state.rawSeries.slice(0, t).map(p => p.value), paramsV2.windowSize);
        state.v2State.previousS = EngineV2.updateEWMA(rawPoint.value, state.v2State.previousS, paramsV2.alpha);
        const sVal = state.v2State.previousS;
        const thresholdsV2 = EngineV2.calculateConformalThresholds(state.v2State.residuals, paramsV2.alphaWarn, paramsV2.alphaCrit);
        const zV2 = EngineV2.calculateZScore(sVal, baselineV2.median, baselineV2.dispersion);
        const l2Alert = EngineV2.classifyAlert(zV2, thresholdsV2, paramsV2.polarity);
        state.v2State.cusum = EngineV2.updateCUSUM(zV2, state.v2State.cusum, paramsV2.k, paramsV2.h);

        let finalAlert = l2Alert;
        if (paramsV2.cusumOverride === 'ON' && state.v2State.cusum.drift && l2Alert === 'NORMAL') {
            finalAlert = 'WARNING';
        }

        const health = EngineV2.calculateHealth(zV2, finalAlert);
        if (zV2 !== 0) state.v2State.residuals.push(Math.abs(zV2));

        state.processedSeriesV2.push({
            ...rawPoint,
            sVal,
            ...baselineV2,
            z: zV2,
            alert: finalAlert,
            l2Alert,
            cusum: { ...state.v2State.cusum },
            thresholds: { ...thresholdsV2 },
            health
        });
    }

    updateVisuals();
    updateTimelineDisplay();
}

function updateVisuals() {
    const labelsV2 = state.processedSeriesV2.map(p => p.date);
    const rawV2 = state.processedSeriesV2.map(p => p.value);
    const smoothedV2 = state.processedSeriesV2.map(p => p.sVal);
    const mediansV2 = state.processedSeriesV2.map(p => p.median);
    const zScoresV2 = state.processedSeriesV2.map(p => p.z);

    const thresholds = {
        warning: state.processedSeriesV2.map(p => p.thresholds?.warning || 1.2),
        critical: state.processedSeriesV2.map(p => p.thresholds?.critical || 2.5)
    };

    ChartService.update(labelsV2, rawV2, smoothedV2, mediansV2, zScoresV2, thresholds, true);

    renderSignalLogV2();
    updateV2Health();
    updateValidation();
}

function getParamsV2() {
    return {
        alpha: parseFloat(document.getElementById('v2-param-alpha').value),
        windowSize: parseInt(document.getElementById('v2-param-window').value),
        polarity: document.getElementById('v2-param-polarity').value,
        k: parseFloat(document.getElementById('v2-param-k').value),
        h: parseFloat(document.getElementById('v2-param-h').value),
        cusumOverride: document.getElementById('v2-param-cusum-override').value,
        alphaWarn: parseFloat(document.getElementById('v2-param-conf-warn').value),
        alphaCrit: parseFloat(document.getElementById('v2-param-conf-crit').value)
    };
}

function updateTimelineDisplay() {
    const current = state.rawSeries[state.currentIndex];
    if (current) {
        document.getElementById('current-date-v2').textContent = current.date;
    }
}

function togglePlay() {
    if (state.isPlaying) pause(); else play();
}

function play() {
    state.isPlaying = true;
    document.getElementById('btn-play-v2').textContent = 'Pause';
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
    document.getElementById('btn-play-v2').textContent = 'Play';
    clearInterval(state.playInterval);
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

function renderSignalLogV2() {
    const tbody = document.querySelector('#signal-log-v2-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    [...state.processedSeriesV2].reverse().slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.value?.toFixed(1) ?? '-'}</td>
      <td>${row.sVal?.toFixed(1) ?? '-'}</td>
      <td>${row.median?.toFixed(1) ?? '-'}</td>
      <td>${row.dispersion?.toFixed(2) ?? '-'}<br><small>${row.method}</small></td>
      <td>${row.z?.toFixed(2) ?? '-'}</td>
      <td>${((row.confidence || 0) * 100).toFixed(0)}%</td>
      <td>${row.thresholds?.warning.toFixed(1)}/${row.thresholds?.critical.toFixed(1)}<br><small>${row.thresholds?.method}</small></td>
      <td>${row.cusum?.s_pos.toFixed(1)}/${row.cusum?.s_neg.toFixed(1)}${row.cusum?.drift ? '<br>DRIFT' : ''}</td>
      <td><span class="alert-tag alert-${row.l2Alert}">${row.l2Alert}</span></td>
      <td><span class="alert-tag alert-${row.alert}">${row.alert}</span></td>
    `;
        tbody.appendChild(tr);
    });
}

function updateV2Health() {
    const current = state.processedSeriesV2[state.processedSeriesV2.length - 1];
    if (!current || !current.health) return;

    const scoreEl = document.getElementById('v2-health-score');
    const statusEl = document.getElementById('v2-health-status');
    const debugEl = document.getElementById('v2-debug-panel');

    if (scoreEl) scoreEl.textContent = (current.health.score * 100).toFixed(0) + '%';
    if (statusEl) {
        statusEl.textContent = current.health.status;
        statusEl.style.color = current.health.status === 'HEALTHY' ? 'var(--positive)' : (current.health.status === 'AT_RISK' ? 'var(--warning)' : 'var(--critical)');
    }

    if (debugEl) {
        debugEl.innerHTML = `
      <strong>Audit Info (Week ${state.currentIndex})</strong><br>
      n=${current.n} | Confidence=${((current.confidence || 0) * 100).toFixed(0)}%<br>
      Dispersion Method: ${current.method}<br>
      CUSUM s+: ${current.cusum.s_pos.toFixed(2)} | s-: ${current.cusum.s_neg.toFixed(2)}<br>
      Drift: ${current.cusum.drift ? current.cusum.direction : 'None'}<br>
      Thresholds: ${current.thresholds.method}
    `;
    }
}

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
    if (!state.processedSeriesV2.length || !state.events) return;

    const results = MetricService.calculate(state.processedSeriesV2, state.events);
    if (results) {
        document.getElementById('metric-precision-v2').textContent = (results.precision * 100).toFixed(1) + '%';
        document.getElementById('metric-recall-v2').textContent = (results.recall * 100).toFixed(1) + '%';
        document.getElementById('metric-lead-v2').textContent = results.avgLeadTime.toFixed(1) + ' wks';
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
