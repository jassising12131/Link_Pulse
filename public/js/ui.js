/* UI helpers: toasts, modals, formatting, theme */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity 0.3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 2600);
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
  return root.querySelector('.modal');
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function fmt(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString();
}

function shortUrl(slug) { return `${location.origin}/r/${slug}`; }

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Copied to clipboard');
  }
}

/* ---------- Theme ---------- */
const THEMES = [
  { id: 'light', name: 'iOS Light', desc: 'Clean & bright', sw: 'sw-light' },
  { id: 'black', name: 'Contrast Black', desc: 'True-black OLED', sw: 'sw-black' },
  { id: 'glass', name: 'Translucent', desc: 'Frosted glass', sw: 'sw-glass' }
];
function applyTheme(id) {
  if (!THEMES.some(t => t.id === id)) id = 'light';
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('lp-theme', id);
  if (window.rerenderCharts) window.rerenderCharts();
}
applyTheme(localStorage.getItem('lp-theme') || 'light');

function themeCardsHtml() {
  const cur = localStorage.getItem('lp-theme') || 'light';
  return `<div class="theme-cards">${THEMES.map(t => `
    <div class="theme-card ${t.id === cur ? 'active' : ''}" onclick="applyTheme('${t.id}'); render()">
      <div class="swatch ${t.sw}"></div>
      <div class="tc-name">${t.name}</div>
      <div class="tc-desc">${t.desc}</div>
    </div>`).join('')}</div>`;
}

const DEVICE_ICONS = { Desktop: '💻', Mobile: '📱', Tablet: '📱', Smarttv: '📺', Console: '🎮', Wearable: '⌚️' };
const flagEmoji = (cc) => {
  if (!cc || cc.length !== 2 || cc === 'Un') return '🌐';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1A5 + c.charCodeAt(0)));
};
