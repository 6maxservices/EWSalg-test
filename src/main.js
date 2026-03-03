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

    // Aggregation
    const aggMethod = document.getElementById('agg-method').value;
    let weekly = aggMethod === 'NONE' ? parsed : DataService.aggregateToWeekly(parsed, aggMethod);

    // Gap Sequence
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

/**
 * Runs the EWS pipeline from index 0 to state.currentIndex (strictly week-by-week)
 */
function runToCurrent() {
  const params = getParams();
  state.processedSeries = [];
  state.freezeState = { consecutiveLow: 0, frozen: false };

  // EWMA first (can be pre-calc or on-the-fly)
  const seriesWithEWMA = Engine.computeEWMA(state.rawSeries, params.alpha);

  for (let t = 0; t <= state.currentIndex; t++) {
    const point = seriesWithEWMA[t];

    if (point.isGap) {
      state.processedSeries.push({ ...point, z: null, alert: 'GAP', baseline: null });
      continue;
    }

    // Baseline calculation (Weeks < t)
    const baseline = Engine.calculateBaseline(seriesWithEWMA, params.windowSize, t);

    // Check Warmup
    if (t < params.warmupWeeks) {
      state.processedSeries.push({ ...point, z: null, alert: 'WARMUP', ...baseline });
      continue;
    }

    // Apply Freeze if currently frozen (baseline override)
    // In a real playback, we'd use the last non-frozen baseline.
    // Let's refine the engine call.
    let effectiveBaseline = { ...baseline };
    if (state.freezeState.frozen) {
      const lastNormal = [...state.processedSeries].reverse().find(p => !p.frozen);
      if (lastNormal) {
        effectiveBaseline.median = lastNormal.median;
        effectiveBaseline.mad = lastNormal.mad;
      }
    }

    const z = Engine.calculateZScore(point.ewma, effectiveBaseline.median, effectiveBaseline.mad);
    const alert = Engine.classify(z, params);

    // Update Freeze State
    state.freezeState = Engine.updateFreezeState(z, state.freezeState.consecutiveLow, params.freezeN, params.warning);

    state.processedSeries.push({
      ...point,
      ...effectiveBaseline,
      z,
      alert,
      frozen: state.freezeState.frozen
    });
  }

  updateVisuals();
  updateTimelineDisplay();
}

// --- UI Sync ---
function updateVisuals() {
  const labels = state.processedSeries.map(p => p.date);
  const raw = state.processedSeries.map(p => p.value);
  const ewma = state.processedSeries.map(p => p.ewma);
  const medians = state.processedSeries.map(p => p.median);
  const zScores = state.processedSeries.map(p => p.z);

  ChartService.update(labels, raw, ewma, medians, zScores, getParams());
  renderSignalLog();
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

// --- Helpers ---
function getParams() {
  return {
    alpha: parseFloat(document.getElementById('param-alpha').value),
    windowSize: parseInt(document.getElementById('param-window').value),
    warning: parseFloat(document.getElementById('param-warn').value),
    critical: parseFloat(document.getElementById('param-crit').value),
    positiveSpike: 2.5, // Fixed per requirements or can be added to UI
    freezeN: parseInt(document.getElementById('param-freeze-n').value),
    warmupWeeks: parseInt(document.getElementById('param-warmup').value),
  };
}

function renderDataPreview() {
  const tbody = document.querySelector('#data-preview-table tbody');
  tbody.innerHTML = '';
  // Show first 10
  state.rawSeries.slice(0, 10).forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.date}</td><td>${row.value ?? '-'}</td><td>${row.isGap ? '<span style="color:var(--critical)">GAP</span>' : 'OK'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderSignalLog() {
  const tbody = document.querySelector('#signal-log-table tbody');
  tbody.innerHTML = '';
  // Show last 50 for performance
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
