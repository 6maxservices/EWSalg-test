import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let mainChart = null;
let zChart = null;

export const ChartService = {
    init: (mainCanvasId, zCanvasId) => {
        const mainCtx = document.getElementById(mainCanvasId).getContext('2d');
        const zCtx = document.getElementById(zCanvasId).getContext('2d');

        mainChart = new Chart(mainCtx, {
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
                        label: 'EWMA',
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
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#94a3b8' } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });

        zChart = new Chart(zCtx, {
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
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        min: -5,
                        max: 5
                    }
                }
            }
        });
    },

    update: (labels, raw, ewma, median, zScores, thresholds) => {
        mainChart.data.labels = labels;
        mainChart.data.datasets[0].data = raw;
        mainChart.data.datasets[1].data = ewma;
        mainChart.data.datasets[2].data = median;
        mainChart.update('none');

        zChart.data.labels = labels;
        zChart.data.datasets[0].data = zScores;
        // Add threshold lines dynamically if they don't exist
        zChart.update('none');
    },

    clear: () => {
        if (mainChart) {
            mainChart.data.labels = [];
            mainChart.data.datasets.forEach(d => d.data = []);
            mainChart.update();
        }
        if (zChart) {
            zChart.data.labels = [];
            zChart.data.datasets.forEach(d => d.data = []);
            zChart.update();
        }
    }
};
