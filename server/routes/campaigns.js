const express = require('express');
const { nanoid, customAlphabet } = require('nanoid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
const slugId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function uniqueSlug(base) {
  let slug = base || slugId();
  while (db.prepare('SELECT 1 FROM links WHERE slug=?').get(slug)) {
    slug = `${base ? base + '-' : ''}${slugId().slice(0, 4)}`;
  }
  return slug;
}

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  const withProto = /^https?:\/\//i.test(u) ? u : 'https://' + u;
  try { new URL(withProto); return withProto; } catch { return null; }
}

// List campaigns with per-campaign stats
router.get('/', requireAuth, (req, res) => {
  const scope = req.user.role === 'admin' ? '' : 'WHERE c.id IN (SELECT DISTINCT campaign_id FROM links WHERE owner_user_id = ?)';
  const args = req.user.role === 'admin' ? [] : [req.user.id];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM links l WHERE l.campaign_id=c.id) AS link_count,
      (SELECT COUNT(*) FROM clicks k JOIN links l ON k.link_id=l.id WHERE l.campaign_id=c.id) AS total_clicks,
      (SELECT COUNT(DISTINCT k.visitor_hash) FROM clicks k JOIN links l ON k.link_id=l.id WHERE l.campaign_id=c.id) AS unique_clicks
    FROM campaigns c ${scope} ORDER BY c.id DESC
  `).all(...args);
  res.json({ campaigns: rows });
});

// Create campaign + bulk agent links. body: { name, destination, agents: [{name, userId?}] }
router.post('/', requireAdmin, (req, res) => {
  const { name, destination, agents } = req.body || {};
  const dest = normalizeUrl(destination);
  if (!name || !dest) return res.status(400).json({ error: 'Campaign name and a valid destination URL are required' });

  const create = db.transaction(() => {
    const camp = db.prepare('INSERT INTO campaigns (name, destination, created_by) VALUES (?,?,?)')
      .run(name.trim(), dest, req.user.id);
    const campaignId = camp.lastInsertRowid;
    const base = slugify(name);
    const created = [];
    for (const agent of (Array.isArray(agents) ? agents : [])) {
      const agentName = String(agent.name || '').trim();
      if (!agentName) continue;
      const slug = uniqueSlug(`${base}-${slugify(agentName)}`);
      const r = db.prepare(`INSERT INTO links (slug, destination, title, campaign_id, agent_name, owner_user_id)
        VALUES (?,?,?,?,?,?)`)
        .run(slug, dest, `${name} — ${agentName}`, campaignId, agentName, agent.userId || null);
      created.push({ id: r.lastInsertRowid, slug, agent_name: agentName });
    }
    return { campaignId, links: created };
  });
  res.json(create());
});

// Campaign detail: links with stats
router.get('/:id', requireAuth, (req, res) => {
  const camp = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const ownFilter = req.user.role === 'admin' ? '' : 'AND l.owner_user_id = ?';
  const args = req.user.role === 'admin' ? [camp.id] : [camp.id, req.user.id];
  const links = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM clicks k WHERE k.link_id=l.id) AS total_clicks,
      (SELECT COUNT(DISTINCT k.visitor_hash) FROM clicks k WHERE k.link_id=l.id) AS unique_clicks,
      (SELECT MAX(k.ts) FROM clicks k WHERE k.link_id=l.id) AS last_click_at
    FROM links l WHERE l.campaign_id=? ${ownFilter} ORDER BY total_clicks DESC
  `).all(...args);
  res.json({ campaign: camp, links });
});

// Add agent link(s) to existing campaign
router.post('/:id/agents', requireAdmin, (req, res) => {
  const camp = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const agents = Array.isArray(req.body?.agents) ? req.body.agents : [];
  const base = slugify(camp.name);
  const created = [];
  for (const agent of agents) {
    const agentName = String(agent.name || '').trim();
    if (!agentName) continue;
    const slug = uniqueSlug(`${base}-${slugify(agentName)}`);
    const r = db.prepare(`INSERT INTO links (slug, destination, title, campaign_id, agent_name, owner_user_id)
      VALUES (?,?,?,?,?,?)`)
      .run(slug, camp.destination, `${camp.name} — ${agentName}`, camp.id, agentName, agent.userId || null);
    created.push({ id: r.lastInsertRowid, slug, agent_name: agentName });
  }
  res.json({ links: created });
});

router.patch('/:id', requireAdmin, (req, res) => {
  const camp = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const name = req.body?.name ? String(req.body.name).trim() : camp.name;
  let dest = camp.destination;
  if (req.body?.destination) {
    dest = normalizeUrl(req.body.destination);
    if (!dest) return res.status(400).json({ error: 'Invalid destination URL' });
    // Update destination for all campaign links too
    db.prepare('UPDATE links SET destination=? WHERE campaign_id=?').run(dest, camp.id);
  }
  db.prepare('UPDATE campaigns SET name=?, destination=? WHERE id=?').run(name, dest, camp.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = { router, uniqueSlug, slugify, normalizeUrl };
