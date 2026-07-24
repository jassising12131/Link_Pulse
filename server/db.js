const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'linkpulse.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  destination TEXT NOT NULL,
  title TEXT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_name TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  country TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  referrer_domain TEXT,
  visitor_hash TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_ts ON clicks(link_id, ts);
CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks(ts);
CREATE INDEX IF NOT EXISTS idx_links_campaign ON links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_user_id);
`);

module.exports = { db, DB_PATH, DATA_DIR };
