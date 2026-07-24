const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = express.Router();

// Seed first admin from env (or a default that MUST be changed)
function seedAdmin() {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin'`).get().n;
  if (count > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@linkpulse.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  db.prepare(`INSERT INTO users (email, name, password_hash, role, approved) VALUES (?, ?, ?, 'admin', 1)`)
    .run(email, 'Admin', bcrypt.hashSync(password, 10));
  console.log(`Seeded admin account: ${email}${process.env.ADMIN_PASSWORD ? '' : ' (password: changeme123 — change it!)'}`);
}
seedAdmin();

router.post('/register', (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    db.prepare(`INSERT INTO users (email, name, password_hash, role, approved) VALUES (?, ?, ?, 'user', 0)`)
      .run(email.toLowerCase().trim(), name.trim(), bcrypt.hashSync(password, 10));
    res.json({ ok: true, message: 'Account created. An admin must approve it before you can log in.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.approved) return res.status(403).json({ error: 'Account pending admin approval' });
  setAuthCookie(res, user);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!next || next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
