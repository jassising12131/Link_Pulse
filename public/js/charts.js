/* Chart.js builders — colors come from theme CSS variables so every theme validates */

const liveCharts = [];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function seriesColors() {
  return ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(cssVar);
}
function chartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--grid-line');
}

function destroyCharts() {
  while (liveCharts.length) liveCharts.pop().destroy();
}

function lineChart(canvasId, series, unit) {
  chartDefaults();
  const el = document.getElementById(canvasId);
  if (!el) return;
  const labels = series.map(p => {
    if (unit === 'hour') return p.bucket.slice(11, 16);
    const d = new Date(p.bucket + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const c = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Clicks', data: series.map(p => p.clicks),
          borderColor: cssVar('--s1'), backgroundColor: cssVar('--chart-fill'),
          borderWidth: 2, fill: true, tension: 0.35,
          pointRadius: series.length > 40 ? 0 : 3, pointHoverRadius: 5,
          pointBackgroundColor: cssVar('--s1')
        },
        {
          label: 'Unique visitors', data: series.map(p => p.uniques),
          borderColor: cssVar('--s5'), borderWidth: 2, fill: false, tension: 0.35,
          pointRadius: series.length > 40 ? 0 : 3, pointHoverRadius: 5,
          pointBackgroundColor: cssVar('--s5')
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, color: cssVar('--text-2') } },
        tooltip: {
          backgroundColor: cssVar('--text'), titleColor: cssVar('--bg'), bodyColor: cssVar('--bg'),
          cornerRadius: 10, padding: 10, displayColors: false
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: cssVar('--grid-line') }, ticks: { precision: 0, maxTicksLimit: 5 }, border: { display: false } }
      }
    }
  });
  liveCharts.push(c);
}

function donutChart(canvasId, rows) {
  chartDefaults();
  const el = document.getElementById(canvasId);
  if (!el) return;
  const colors = seriesColors();
  const top = rows.slice(0, 6);
  const c = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: top.map(r => r.label || 'Unknown'),
      datasets: [{
        data: top.map(r => r.clicks),
        backgroundColor: top.map((_, i) => colors[i % colors.length]),
        borderColor: cssVar('--surface') || cssVar('--bg'),
        borderWidth: 2, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, color: cssVar('--text-2'), padding: 14 } },
        tooltip: { backgroundColor: cssVar('--text'), titleColor: cssVar('--bg'), bodyColor: cssVar('--bg'), cornerRadius: 10, padding: 10 }
      }
    }
  });
  liveCharts.push(c);
}

function barChart(canvasId, rows, horizontal = true) {
  chartDefaults();
  const el = document.getElementById(canvasId);
  if (!el) return;
  const c = new Chart(el, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label || 'Unknown'),
      datasets: [{
        data: rows.map(r => r.clicks),
        backgroundColor: cssVar('--s1'),
        borderRadius: 4, borderSkipped: false, maxBarThickness: 18
      }]
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: cssVar('--text'), titleColor: cssVar('--bg'), bodyColor: cssVar('--bg'), cornerRadius: 10, padding: 10, displayColors: false }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: horizontal ? cssVar('--grid-line') : 'transparent' }, ticks: { precision: 0 }, border: { display: false } },
        y: { grid: { display: false }, ticks: { color: cssVar('--text-2') } }
      }
    }
  });
  liveCharts.push(c);
}

/* Heatmap rendered as CSS grid (not Chart.js) */
function heatmapHtml(cells) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const map = {};
  let max = 0;
  for (const c of cells) { map[`${c.dow}-${c.hour}`] = c.clicks; if (c.clicks > max) max = c.clicks; }
  let html = '<div class="hm-grid">';
  for (let d = 0; d < 7; d++) {
    html += `<div class="hm-day">${days[d]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = map[`${d}-${h}`] || 0;
      const alpha = max ? (0.12 + 0.88 * (v / max)) : 0;
      const bg = v ? `style="background: color-mix(in srgb, var(--s1) ${Math.round(alpha * 100)}%, var(--input-bg))"` : '';
      html += `<div class="hm-cell" ${bg} data-tip="${days[d]} ${String(h).padStart(2, '0')}:00 — ${v} click${v === 1 ? '' : 's'}"></div>`;
    }
  }
  html += '</div><div class="hm-hours"><span></span>';
  for (let h = 0; h < 24; h++) html += `<span>${h % 6 === 0 ? h : ''}</span>`;
  html += '</div>';
  return html;
}
