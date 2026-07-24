const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { db } = require('./db');
const { logClick } = require('./services/clickLogger');
const { restoreFromGitHubIfEmpty, startAutoBackup } = require('./services/backup');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' })); // backup imports can be large
app.use(cookieParser());

// ---------- Short link redirect (the hot path) ----------
app.get('/r/:slug', (req, res) => {
  const link = db.prepare('SELECT id, destination, active, expires_at FROM links WHERE slug=?').get(req.params.slug);
  if (!link || !link.active) return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  }
  res.redirect(302, link.destination);
  logClick(link.id, req);
});

// ---------- Keep-alive / health ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), ts: new Date().toISOString() });
});

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/campaigns', require('./routes/campaigns').router);
app.use('/api/links', require('./routes/links'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/users', require('./routes/users'));
app.use('/api/backup', require('./routes/backup'));

// ---------- Static SPA ----------
app.get('/vendor/chart.umd.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
});
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api|r\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  await restoreFromGitHubIfEmpty();
  startAutoBackup();

  // Optional self-ping to fight Render free-tier sleep (external pinger still recommended)
  const selfUrl = process.env.SELF_URL || (process.env.RENDER_EXTERNAL_URL || null);
  if (selfUrl && process.env.SELF_PING !== 'off') {
    setInterval(() => {
      fetch(`${selfUrl.replace(/\/$/, '')}/api/health`).catch(() => {});
    }, 10 * 60 * 1000);
    console.log(`Self-ping enabled: ${selfUrl}/api/health every 10 min`);
  }

  app.listen(PORT, () => console.log(`LinkPulse running on http://localhost:${PORT}`));
})();
