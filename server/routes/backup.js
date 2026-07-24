const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../auth');
const { exportData, importData, backupToGitHub, ghEnabled } = require('../services/backup');

const router = express.Router();

router.get('/status', requireAdmin, (req, res) => {
  const last = db.prepare(`SELECT value FROM settings WHERE key='last_backup_at'`).get();
  res.json({
    github_enabled: ghEnabled(),
    last_backup_at: last ? last.value : null,
    counts: {
      users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
      campaigns: db.prepare('SELECT COUNT(*) n FROM campaigns').get().n,
      links: db.prepare('SELECT COUNT(*) n FROM links').get().n,
      clicks: db.prepare('SELECT COUNT(*) n FROM clicks').get().n
    }
  });
});

router.get('/export', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="linkpulse-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(exportData()));
});

router.post('/import', requireAdmin, (req, res) => {
  try {
    const result = importData(req.body);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/github', requireAdmin, async (req, res) => {
  try {
    const result = await backupToGitHub();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
