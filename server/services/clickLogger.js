const crypto = require('crypto');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const { db } = require('../db');

const SALT = process.env.VISITOR_SALT || 'linkpulse-salt';

const insertClick = db.prepare(`
  INSERT INTO clicks (link_id, country, city, device, browser, os, referrer_domain, visitor_hash)
  VALUES (@link_id, @country, @city, @device, @browser, @os, @referrer_domain, @visitor_hash)
`);

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function referrerDomain(ref) {
  if (!ref) return 'Direct';
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    const map = {
      'l.facebook.com': 'Facebook', 'facebook.com': 'Facebook', 'm.facebook.com': 'Facebook',
      'lm.facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'l.instagram.com': 'Instagram',
      't.co': 'Twitter/X', 'twitter.com': 'Twitter/X', 'x.com': 'Twitter/X',
      'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube', 'youtu.be': 'YouTube',
      'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
      'wa.me': 'WhatsApp', 'whatsapp.com': 'WhatsApp', 'web.whatsapp.com': 'WhatsApp', 'api.whatsapp.com': 'WhatsApp',
      'telegram.org': 'Telegram', 't.me': 'Telegram', 'web.telegram.org': 'Telegram',
      'google.com': 'Google', 'reddit.com': 'Reddit', 'out.reddit.com': 'Reddit',
      'tiktok.com': 'TikTok', 'snapchat.com': 'Snapchat', 'discord.com': 'Discord'
    };
    return map[host] || host;
  } catch {
    return 'Direct';
  }
}

// Logged after the redirect is sent, so the visitor never waits on analytics
function logClick(linkId, req) {
  setImmediate(() => {
    try {
      const ip = getClientIp(req);
      const geo = geoip.lookup(ip);
      const ua = new UAParser(req.headers['user-agent'] || '');
      const deviceType = ua.getDevice().type; // undefined for desktop
      insertClick.run({
        link_id: linkId,
        country: (geo && geo.country) ? geo.country : 'Unknown',
        city: geo && geo.city ? geo.city : 'Unknown',
        device: deviceType ? deviceType.charAt(0).toUpperCase() + deviceType.slice(1) : 'Desktop',
        browser: ua.getBrowser().name || 'Unknown',
        os: ua.getOS().name || 'Unknown',
        referrer_domain: referrerDomain(req.headers['referer'] || req.headers['referrer']),
        visitor_hash: crypto.createHash('sha256').update(SALT + ip + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16)
      });
    } catch (e) {
      console.error('click log failed:', e.message);
    }
  });
}

module.exports = { logClick };
