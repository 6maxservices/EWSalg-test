import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let mainChart = null;
let zChart = null;
let v2MainChart = null;
let v2ZChart = null;

export const ChartService = {
    init: (mainCanvasId, zCanvasId, isV2 = false) => {
        const mainEl = document.getElementById(mainCanvasId);
        const zEl = document.getElementById(zCanvasId);
        if (!mainEl || !zEl) return;
        const mainCtx = mainEl.getContext('2d');
        const zCtx = zEl.getContext('2d');

        const chartConfig = {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Raw Value',
                        data: [],
                        borderColor: 'rgba(148, 163, 184, 0.5)',
                        borderWidth: 1,
                        pointRadius: 2,
                        tension: 0.1
                    },
                    {
                        label: isV2 ? 'EWMA S(t)' : 'EWMA',
                        data: [],
                        borderColor: '#38bdf8',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    {
                        label: 'Baseline Median',
                        data: [],
                        borderColor: 'rgba(129, 140, 248, 0.8)',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        };

        const zChartConfig = {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Z-Score',
                        data: [],
                        borderColor: '#fbbf24',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        min: -5, max: 5
                    }
                }
            }
        };

        if (isV2) {
            zChartConfig.data.datasets.push({
                label: 'Warning',
                data: [],
                borderColor: 'rgba(245, 158, 11, 0.5)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }, {
                label: 'Critical',
                data: [],
                borderColor: 'rgba(239, 68, 68, 0.5)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            });
            v2MainChart = new Chart(mainCtx, chartConfig);
            v2ZChart = new Chart(zCtx, zChartConfig);
        } else {
            mainChart = new Chart(mainCtx, chartConfig);
            zChart = new Chart(zCtx, zChartConfig);
        }
    },

    update: (labels, raw, smoothed, median, zScores, thresholds, isV2 = false) => {
        const main = isV2 ? v2MainChart : mainChart;
        const z = isV2 ? v2ZChart : zChart;

        if (!main || !z) return;

        main.data.labels = labels;
        main.data.datasets[0].data = raw;
        main.data.datasets[1].data = smoothed;
        main.data.datasets[2].data = median;
        main.update('none');

        z.data.labels = labels;
        z.data.datasets[0].data = zScores;

        if (isV2 && thresholds) {
            z.data.datasets[1].data = thresholds.warning;
            z.data.datasets[2].data = thresholds.critical;
            const maxT = Math.max(...thresholds.critical, 5);
            z.options.scales.y.max = maxT + 1;
            z.options.scales.y.min = -(maxT + 1);
        }
        z.update('none');
    },

    clear: () => {
        [mainChart, zChart, v2MainChart, v2ZChart].forEach(c => {
            if (c) {
                c.data.labels = [];
                c.data.datasets.forEach(d => d.data = []);
                c.update();
            }
        });
    }
};
