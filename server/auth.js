const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  // Persist a generated secret in settings so sessions survive restarts without env config
  const row = db.prepare(`SELECT value FROM settings WHERE key='jwt_secret'`).get();
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO settings(key,value) VALUES('jwt_secret',?)`).run(secret);
  return secret;
})();

const COOKIE_NAME = 'lp_token';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id,email,name,role,approved FROM users WHERE id=?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.approved) return res.status(403).json({ error: 'Account pending approval' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAdmin, COOKIE_NAME, JWT_SECRET };
