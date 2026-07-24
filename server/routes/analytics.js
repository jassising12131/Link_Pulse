const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const RANGES = {
  '24h': { modifier: '-24 hours', bucket: '%Y-%m-%d %H:00', unit: 'hour' },
  '7d':  { modifier: '-7 days',   bucket: '%Y-%m-%d', unit: 'day' },
  '30d': { modifier: '-30 days',  bucket: '%Y-%m-%d', unit: 'day' },
  '90d': { modifier: '-90 days',  bucket: '%Y-%m-%d', unit: 'day' },
  'all': { modifier: '-3650 days', bucket: '%Y-%m-%d', unit: 'day' }
};

// Builds the WHERE clause limiting clicks to what this user may see + optional link/campaign filter
function scopeFor(req) {
  const where = [];
  const args = [];
  if (req.user.role !== 'admin') {
    where.push('l.owner_user_id = ?');
    args.push(req.user.id);
  }
  if (req.query.link_id) { where.push('l.id = ?'); args.push(req.query.link_id); }
  if (req.query.campaign_id) { where.push('l.campaign_id = ?'); args.push(req.query.campaign_id); }
  return { where: where.length ? 'AND ' + where.join(' AND ') : '', args };
}

router.get('/', requireAuth, (req, res) => {
  const range = RANGES[req.query.range] || RANGES['7d'];
  const { where, args } = scopeFor(req);
  const base = `FROM clicks k JOIN links l ON l.id = k.link_id WHERE k.ts >= datetime('now', ?) ${where}`;
  const allTime = `FROM clicks k JOIN links l ON l.id = k.link_id WHERE 1=1 ${where}`;

  const totals = db.prepare(`
    SELECT COUNT(*) AS clicks, COUNT(DISTINCT k.visitor_hash) AS uniques ${base}
  `).get(range.modifier, ...args);

  const allTotals = db.prepare(`
    SELECT COUNT(*) AS clicks, COUNT(DISTINCT k.visitor_hash) AS uniques ${allTime}
  `).get(...args);

  const today = db.prepare(`
    SELECT COUNT(*) AS clicks FROM clicks k JOIN links l ON l.id=k.link_id
    WHERE date(k.ts) = date('now') ${where}
  `).get(...args);

  const series = db.prepare(`
    SELECT strftime('${range.bucket}', k.ts) AS bucket, COUNT(*) AS clicks, COUNT(DISTINCT k.visitor_hash) AS uniques
    ${base} GROUP BY bucket ORDER BY bucket
  `).all(range.modifier, ...args);

  const breakdown = (col) => db.prepare(`
    SELECT ${col} AS label, COUNT(*) AS clicks ${base}
    GROUP BY ${col} ORDER BY clicks DESC LIMIT 12
  `).all(range.modifier, ...args);

  const leaderboard = db.prepare(`
    SELECT l.id AS link_id, COALESCE(l.agent_name, l.slug) AS agent, l.slug,
           c.name AS campaign_name,
           COUNT(k.id) AS clicks, COUNT(DISTINCT k.visitor_hash) AS uniques
    FROM links l
    LEFT JOIN campaigns c ON c.id = l.campaign_id
    LEFT JOIN clicks k ON k.link_id = l.id AND k.ts >= datetime('now', ?)
    WHERE 1=1 ${where}
    GROUP BY l.id ORDER BY clicks DESC LIMIT 20
  `).all(range.modifier, ...args);

  const heatmap = db.prepare(`
    SELECT CAST(strftime('%w', k.ts) AS INTEGER) AS dow, CAST(strftime('%H', k.ts) AS INTEGER) AS hour, COUNT(*) AS clicks
    ${base} GROUP BY dow, hour
  `).all(range.modifier, ...args);

  const recent = db.prepare(`
    SELECT k.ts, k.country, k.city, k.device, k.browser, k.os, k.referrer_domain,
           COALESCE(l.agent_name, l.slug) AS agent, l.slug
    FROM clicks k JOIN links l ON l.id = k.link_id WHERE 1=1 ${where}
    ORDER BY k.id DESC LIMIT 25
  `).all(...args);

  res.json({
    range: req.query.range || '7d',
    unit: range.unit,
    totals: { ...totals, all_clicks: allTotals.clicks, all_uniques: allTotals.uniques, today: today.clicks },
    series,
    devices: breakdown('k.device'),
    browsers: breakdown('k.browser'),
    countries: breakdown('k.country'),
    os: breakdown('k.os'),
    referrers: breakdown('k.referrer_domain'),
    leaderboard,
    heatmap,
    recent
  });
});

// CSV export: raw clicks
router.get('/export/clicks.csv', requireAuth, (req, res) => {
  const { where, args } = scopeFor(req);
  const rows = db.prepare(`
    SELECT k.ts, l.slug, COALESCE(l.agent_name,'') AS agent, COALESCE(c.name,'') AS campaign,
           k.country, k.city, k.device, k.browser, k.os, k.referrer_domain, k.visitor_hash
    FROM clicks k JOIN links l ON l.id=k.link_id LEFT JOIN campaigns c ON c.id=l.campaign_id
    WHERE 1=1 ${where} ORDER BY k.id DESC LIMIT 100000
  `).all(...args);
  const header = 'timestamp,slug,agent,campaign,country,city,device,browser,os,referrer,visitor';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows.map(r => [r.ts, r.slug, r.agent, r.campaign, r.country, r.city, r.device, r.browser, r.os, r.referrer_domain, r.visitor_hash].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="linkpulse-clicks.csv"');
  res.send(csv);
});

// CSV export: per-agent summary
router.get('/export/agents.csv', requireAuth, (req, res) => {
  const { where, args } = scopeFor(req);
  const rows = db.prepare(`
    SELECT COALESCE(l.agent_name, l.slug) AS agent, l.slug, COALESCE(c.name,'') AS campaign,
           COUNT(k.id) AS clicks, COUNT(DISTINCT k.visitor_hash) AS uniques, MAX(k.ts) AS last_click
    FROM links l LEFT JOIN campaigns c ON c.id=l.campaign_id
    LEFT JOIN clicks k ON k.link_id=l.id
    WHERE 1=1 ${where} GROUP BY l.id ORDER BY clicks DESC
  `).all(...args);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['agent,slug,campaign,total_clicks,unique_clicks,last_click',
    ...rows.map(r => [r.agent, r.slug, r.campaign, r.clicks, r.uniques, r.last_click].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="linkpulse-agents.csv"');
  res.send(csv);
});

module.exports = router;
