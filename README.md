<p align="center"><img src="public/logo.svg" width="96" alt="LinkPulse logo"></p>

<h1 align="center">LinkPulse</h1>

<p align="center"><b>Self-hosted Bitly-style link tracker with per-agent analytics — runs 100% free on Render.</b></p>

Share one community link through many agents: every agent gets their own short link to the same destination, and you see exactly who brings the traffic.

- 🎯 **Campaigns** — one destination → bulk-generate a unique tracked link per agent
- 📊 **Full analytics** — clicks & unique visitors over time, agent leaderboard, devices, browsers, OS, countries, traffic sources (WhatsApp / Instagram / Facebook / Telegram…), peak-hours heatmap, live click feed
- 🔳 **QR codes** & one-click copy per link, CSV exports
- 👥 **Multi-admin + agent accounts** — admins see everything, agents see only their own links
- 🎨 **3 premium iOS themes** — iOS Light, Contrast Black (OLED), Translucent (frosted glass)
- 📱 Fully responsive (sidebar on desktop, iOS tab bar on mobile)
- 💾 Built-in backup: one-click export/restore + optional **free auto-backup to GitHub**

---

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

Default admin login: `admin@linkpulse.local` / `changeme123` (change immediately, or set `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars before first run).

---

## Deploy on Render — free, step by step

1. **Push this folder to GitHub** (private repo is fine):
   ```bash
   git init && git add -A && git commit -m "LinkPulse"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/linkpulse.git
   git push -u origin main
   ```
2. On [render.com](https://render.com) → **New → Blueprint** → select the repo. Render reads `render.yaml` automatically.
   (Or **New → Web Service**: Build `npm install`, Start `npm start`, plan **Free**.)
3. Set environment variables when prompted:
   | Variable | Value |
   |---|---|
   | `ADMIN_EMAIL` | your login email |
   | `ADMIN_PASSWORD` | a strong password |
4. Deploy. Your app is live at `https://yourapp.onrender.com` — short links look like `https://yourapp.onrender.com/r/community-rahul`.

### Keep it awake 24/7 (free)

Render free services sleep after 15 min idle (first click then takes ~50s). Fix:

1. Create a free account at **[uptimerobot.com](https://uptimerobot.com)** (or cron-job.org)
2. Add an **HTTP monitor** for `https://yourapp.onrender.com/api/health`
3. Interval: **every 5–10 minutes**. Done — the app never sleeps.

### Keep your data safe (free)

⚠️ Render's free disk is **ephemeral**: every deploy/restart wipes local files, including the SQLite database. LinkPulse ships two protections:

**Option A — GitHub auto-backup (recommended, fully automatic):**
1. Create a **private** GitHub repo, e.g. `linkpulse-data`
2. Create a token at github.com → Settings → Developer settings → **Fine-grained tokens** → access to that one repo → Repository permissions → **Contents: Read and write**
3. In Render → Environment, add:
   | Variable | Value |
   |---|---|
   | `GITHUB_TOKEN` | the token |
   | `BACKUP_REPO` | `YOURNAME/linkpulse-data` |
4. Redeploy. The app now auto-backs up every 30 min and **auto-restores on boot** if the database is empty. Your data survives every deploy.

**Option B — manual:** Settings → Backup → **Export backup** regularly; **Restore from file** after a redeploy.

---

## Typical workflow

1. Log in as admin → **Campaigns → New Campaign**
2. Name: *Community Launch*, Destination: your community link, Agents: one name per line
3. Each agent gets a link like `/r/community-launch-rahul` — **Copy all links** and send each agent theirs
4. Watch the **Dashboard**: agent leaderboard, sources, live clicks
5. Optional: create accounts for agents (Team → Add Member, or let them register and approve them), assign links so each agent can log in and see their own stats

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | first admin account |
| `JWT_SECRET` | recommended | session signing (auto-generated otherwise) |
| `VISITOR_SALT` | recommended | salts the anonymous visitor hash |
| `GITHUB_TOKEN` / `BACKUP_REPO` | optional | free automatic backups |
| `BACKUP_PATH` | optional | backup filename (default `linkpulse-backup.json`) |
| `BACKUP_INTERVAL_MIN` | optional | backup frequency (default 30) |
| `SELF_URL` | optional | enables internal self-ping (auto-set on Render) |
| `SELF_PING` | optional | set `off` to disable self-ping |
| `DATA_DIR` | optional | where the SQLite file lives |

## Privacy

Raw IP addresses are **never stored** — only a salted hash for unique-visitor counting, plus country/city derived offline via `geoip-lite`. No third-party analytics or external API calls at click time.
