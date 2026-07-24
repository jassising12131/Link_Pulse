const express = require('express');
const QRCode = require('qrcode');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { uniqueSlug, slugify, normalizeUrl } = require('./campaigns');

const router = express.Router();

function canSeeLink(user, link) {
  return user.role === 'admin' || link.owner_user_id === user.id;
}

router.get('/', requireAuth, (req, res) => {
  const scope = req.user.role === 'admin' ? '' : 'WHERE l.owner_user_id = ?';
  const args = req.user.role === 'admin' ? [] : [req.user.id];
  const links = db.prepare(`
    SELECT l.*, c.name AS campaign_name,
      (SELECT COUNT(*) FROM clicks k WHERE k.link_id=l.id) AS total_clicks,
      (SELECT COUNT(DISTINCT k.visitor_hash) FROM clicks k WHERE k.link_id=l.id) AS unique_clicks,
      (SELECT MAX(k.ts) FROM clicks k WHERE k.link_id=l.id) AS last_click_at
    FROM links l LEFT JOIN campaigns c ON c.id=l.campaign_id
    ${scope} ORDER BY l.id DESC
  `).all(...args);
  res.json({ links });
});

// Standalone quick link (no campaign)
router.post('/', requireAdmin, (req, res) => {
  const { destination, slug, title, agent_name } = req.body || {};
  const dest = normalizeUrl(destination);
  if (!dest) return res.status(400).json({ error: 'A valid destination URL is required' });
  let finalSlug;
  if (slug) {
    finalSlug = slugify(slug);
    if (!finalSlug) return res.status(400).json({ error: 'Invalid custom slug' });
    if (db.prepare('SELECT 1 FROM links WHERE slug=?').get(finalSlug)) {
      return res.status(409).json({ error: 'That slug is already taken' });
    }
  } else {
    finalSlug = uniqueSlug(null);
  }
  const r = db.prepare(`INSERT INTO links (slug, destination, title, agent_name) VALUES (?,?,?,?)`)
    .run(finalSlug, dest, title || null, agent_name || null);
  res.json({ id: r.lastInsertRowid, slug: finalSlug });
});

router.get('/:id', requireAuth, (req, res) => {
  const link = db.prepare(`
    SELECT l.*, c.name AS campaign_name FROM links l
    LEFT JOIN campaigns c ON c.id=l.campaign_id WHERE l.id=?
  `).get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (!canSeeLink(req.user, link)) return res.status(403).json({ error: 'Not your link' });
  res.json({ link });
});

router.patch('/:id', requireAdmin, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id=?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  const updates = {};
  if (req.body?.active !== undefined) updates.active = req.body.active ? 1 : 0;
  if (req.body?.agent_name !== undefined) updates.agent_name = String(req.body.agent_name).trim() || null;
  if (req.body?.owner_user_id !== undefined) updates.owner_user_id = req.body.owner_user_id || null;
  if (req.body?.expires_at !== undefined) updates.expires_at = req.body.expires_at || null;
  if (req.body?.destination) {
    const dest = normalizeUrl(req.body.destination);
    if (!dest) return res.status(400).json({ error: 'Invalid destination URL' });
    updates.destination = dest;
  }
  if (!Object.keys(updates).length) return res.json({ ok: true });
  const set = Object.keys(updates).map(k => `${k}=@${k}`).join(', ');
  db.prepare(`UPDATE links SET ${set} WHERE id=@id`).run({ ...updates, id: link.id });
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM links WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/qr', requireAuth, async (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id=?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (!canSeeLink(req.user, link)) return res.status(403).json({ error: 'Not your link' });
  const shortUrl = `${req.protocol}://${req.get('host')}/r/${link.slug}`;
  const png = await QRCode.toBuffer(shortUrl, { width: 512, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="qr-${link.slug}.png"`);
  res.send(png);
});

module.exports = router;
