const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.approved, u.created_at,
      (SELECT COUNT(*) FROM links l WHERE l.owner_user_id=u.id) AS link_count
    FROM users u ORDER BY u.id
  `).all();
  res.json({ users });
});

// Admin creates a user directly (pre-approved agent account)
router.post('/', requireAdmin, (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const r = db.prepare(`INSERT INTO users (email, name, password_hash, role, approved) VALUES (?,?,?,?,1)`)
      .run(email.toLowerCase().trim(), name.trim(), bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'user');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

router.patch('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.body?.approved !== undefined) {
    db.prepare('UPDATE users SET approved=? WHERE id=?').run(req.body.approved ? 1 : 0, user.id);
  }
  if (req.body?.role) {
    if (user.id === req.user.id && req.body.role !== 'admin') {
      return res.status(400).json({ error: "You can't demote yourself" });
    }
    db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role === 'admin' ? 'admin' : 'user', user.id);
  }
  if (req.body?.password) {
    if (req.body.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), user.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "You can't delete yourself" });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
