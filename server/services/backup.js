const { db } = require('../db');

const TABLES = ['users', 'campaigns', 'links', 'clicks', 'settings'];

function exportData() {
  const dump = { app: 'linkpulse', version: 1, exported_at: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    dump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return dump;
}

function importData(dump) {
  if (!dump || dump.app !== 'linkpulse' || !dump.tables) throw new Error('Not a valid LinkPulse backup file');
  const restore = db.transaction(() => {
    // Delete in FK-safe order, insert in reverse
    for (const t of ['clicks', 'links', 'campaigns', 'users', 'settings']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    for (const t of TABLES) {
      const rows = dump.tables[t] || [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`);
      for (const row of rows) stmt.run(row);
    }
  });
  restore();
  return { restored: Object.fromEntries(TABLES.map(t => [t, (dump.tables[t] || []).length])) };
}

// ---------- Optional GitHub auto-backup (free persistence on Render) ----------
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.BACKUP_REPO; // "username/repo"
const GH_PATH = process.env.BACKUP_PATH || 'linkpulse-backup.json';
const GH_API = GH_REPO ? `https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}` : null;

function ghEnabled() { return Boolean(GH_TOKEN && GH_REPO); }

async function ghGetRemote() {
  const res = await fetch(GH_API, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'linkpulse' }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  return res.json();
}

async function backupToGitHub() {
  if (!ghEnabled()) return { ok: false, reason: 'GitHub backup not configured' };
  const existing = await ghGetRemote();
  const body = {
    message: `linkpulse auto-backup ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(exportData())).toString('base64')
  };
  if (existing && existing.sha) body.sha = existing.sha;
  const res = await fetch(GH_API, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'linkpulse', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  db.prepare(`INSERT INTO settings(key,value) VALUES('last_backup_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(new Date().toISOString());
  return { ok: true };
}

async function restoreFromGitHubIfEmpty() {
  if (!ghEnabled()) return;
  const hasData = db.prepare('SELECT (SELECT COUNT(*) FROM links) + (SELECT COUNT(*) FROM users) AS n').get().n > 0;
  if (hasData) return;
  try {
    const remote = await ghGetRemote();
    if (!remote) return;
    const dump = JSON.parse(Buffer.from(remote.content, 'base64').toString('utf8'));
    const result = importData(dump);
    console.log('Restored database from GitHub backup:', JSON.stringify(result.restored));
  } catch (e) {
    console.error('GitHub restore skipped:', e.message);
  }
}

function startAutoBackup() {
  if (!ghEnabled()) {
    console.log('GitHub auto-backup disabled (set GITHUB_TOKEN and BACKUP_REPO to enable).');
    return;
  }
  const intervalMin = Number(process.env.BACKUP_INTERVAL_MIN || 30);
  setInterval(() => {
    backupToGitHub().catch(e => console.error('auto-backup failed:', e.message));
  }, intervalMin * 60 * 1000);
  console.log(`GitHub auto-backup enabled: every ${intervalMin} min to ${GH_REPO}/${GH_PATH}`);
}

module.exports = { exportData, importData, backupToGitHub, restoreFromGitHubIfEmpty, startAutoBackup, ghEnabled };
