/* LinkPulse SPA — hash router + views */

const state = { user: null, range: localStorage.getItem('lp-range') || '7d', authMode: 'login' };
const $app = document.getElementById('app');

/* ================= Router ================= */
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [name, arg] = h.split('/');
  return { name, arg };
}
window.addEventListener('hashchange', () => render());

async function boot() {
  try {
    const { user } = await api.get('/api/auth/me');
    state.user = user;
  } catch { state.user = null; }
  render();
}

async function render() {
  destroyCharts();
  if (!state.user) return renderAuth();
  const r = route();
  const views = {
    dashboard: renderDashboard,
    campaigns: renderCampaigns,
    campaign: () => renderCampaignDetail(r.arg),
    links: renderLinks,
    users: renderUsers,
    settings: renderSettings
  };
  (views[r.name] || renderDashboard)();
}
window.rerenderCharts = () => { if (state.user) render(); };

/* ================= Shell ================= */
function navItems() {
  const items = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'campaigns', icon: '🎯', label: 'Campaigns' },
    { id: 'links', icon: '🔗', label: 'Links' }
  ];
  if (state.user.role === 'admin') items.push({ id: 'users', icon: '👥', label: 'Team' });
  items.push({ id: 'settings', icon: '⚙️', label: 'Settings' });
  return items;
}

function shell(content, active) {
  const items = navItems();
  $app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><img class="brand-mark" src="/logo.svg" alt=""><div class="brand-name">LinkPulse</div></div>
      ${items.map(i => `<a class="nav-item ${active === i.id ? 'active' : ''}" href="#/${i.id}"><span class="icon">${i.icon}</span>${i.label}</a>`).join('')}
      <div class="nav-spacer"></div>
      <div class="nav-user">
        <div class="nu-name">${esc(state.user.name)}</div>
        <div class="nu-role">${esc(state.user.role)}</div>
      </div>
      <button class="nav-item" onclick="logout()" style="margin-top:8px"><span class="icon">↩︎</span>Sign out</button>
    </aside>
    <main class="main">${content}</main>
  </div>
  <nav class="tabbar">
    ${items.map(i => `<button class="tab-item ${active === i.id ? 'active' : ''}" onclick="location.hash='#/${i.id}'"><span class="icon">${i.icon}</span>${i.label}</button>`).join('')}
  </nav>`;
}

async function logout() { await api.post('/api/auth/logout'); state.user = null; location.hash = ''; render(); }

/* ================= Auth ================= */
function renderAuth() {
  const login = state.authMode === 'login';
  $app.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><img class="mark" src="/logo.svg" alt="LinkPulse"></div>
      <div class="auth-title">LinkPulse</div>
      <div class="auth-sub">${login ? 'Track every click. Know every agent.' : 'Create your agent account'}</div>
      <form id="auth-form">
        ${login ? '' : `<div class="field"><label>Full name</label><input class="input" name="name" required placeholder="Your name"></div>`}
        <div class="field"><label>Email</label><input class="input" type="email" name="email" required placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input class="input" type="password" name="password" required minlength="6" placeholder="••••••••"></div>
        <button class="btn" style="width:100%; margin-top:6px">${login ? 'Sign In' : 'Create Account'}</button>
      </form>
      <div class="auth-switch">
        ${login ? `New agent? <a onclick="state.authMode='register';render()">Create an account</a>`
                : `Already registered? <a onclick="state.authMode='login';render()">Sign in</a>`}
      </div>
      <div class="auth-theme-row">
        <div class="seg">${THEMES.map(t => `<button class="${(localStorage.getItem('lp-theme') || 'light') === t.id ? 'active' : ''}" onclick="applyTheme('${t.id}')" type="button">${t.name.split(' ')[0] === 'iOS' ? 'Light' : t.name.split(' ')[0]}</button>`).join('')}</div>
      </div>
    </div>
  </div>`;
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      if (login) {
        const { user } = await api.post('/api/auth/login', f);
        state.user = user;
        render();
      } else {
        const r = await api.post('/api/auth/register', f);
        toast(r.message || 'Account created');
        state.authMode = 'login';
        render();
      }
    } catch (err) { toast(err.message, true); }
  });
}

/* ================= Dashboard ================= */
function rangeSeg() {
  const ranges = [['24h', '24H'], ['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['all', 'All']];
  return `<div class="seg">${ranges.map(([id, label]) =>
    `<button class="${state.range === id ? 'active' : ''}" onclick="setRange('${id}')">${label}</button>`).join('')}</div>`;
}
function setRange(r) { state.range = r; localStorage.setItem('lp-range', r); render(); }

async function renderDashboard(extra = {}) {
  const { linkId, campaignId, title, backHash } = extra;
  const q = new URLSearchParams({ range: state.range });
  if (linkId) q.set('link_id', linkId);
  if (campaignId) q.set('campaign_id', campaignId);

  shell(`<div class="page-head"><div><div class="page-title">${esc(title || 'Dashboard')}</div>
    <div class="page-sub">${state.user.role === 'admin' ? 'All traffic across your links' : 'Traffic on your links'}</div></div>
    <div class="head-actions">${rangeSeg()}</div></div>
    <div class="grid grid-tiles" id="tiles">${'<div class="card tile"><div class="skel" style="height:64px"></div></div>'.repeat(4)}</div>
    <div id="dash-body" style="margin-top:16px"><div class="card"><div class="skel" style="height:260px"></div></div></div>`,
    linkId || campaignId ? '' : 'dashboard');

  let d;
  try { d = await api.get(`/api/analytics?${q}`); }
  catch (e) { return toast(e.message, true); }

  document.getElementById('tiles').innerHTML = `
    <div class="card tile"><div class="t-label">Clicks (${state.range})</div><div class="t-value">${fmt(d.totals.clicks)}</div><div class="t-hint">All-time: ${fmt(d.totals.all_clicks)}</div></div>
    <div class="card tile"><div class="t-label">Unique visitors</div><div class="t-value">${fmt(d.totals.uniques)}</div><div class="t-hint">All-time: ${fmt(d.totals.all_uniques)}</div></div>
    <div class="card tile"><div class="t-label">Today</div><div class="t-value">${fmt(d.totals.today)}</div><div class="t-hint"><span class="up">live</span> counting</div></div>
    <div class="card tile"><div class="t-label">Top agent</div><div class="t-value" style="font-size:22px; margin-top:9px">${esc(d.leaderboard[0]?.agent || '—')}</div><div class="t-hint">${d.leaderboard[0] ? fmt(d.leaderboard[0].clicks) + ' clicks' : 'no clicks yet'}</div></div>`;

  const maxLb = Math.max(1, ...(d.leaderboard.map(l => l.clicks)));
  const totalBd = (rows) => Math.max(1, rows.reduce((a, r) => a + r.clicks, 0));

  const bdList = (rows, iconFn) => rows.length ? rows.slice(0, 8).map((r, i) => `
    <div class="bd-row">
      ${iconFn ? `<span>${iconFn(r.label)}</span>` : `<span class="bd-dot" style="background:var(--s${(i % 8) + 1})"></span>`}
      <span class="bd-label">${esc(r.label || 'Unknown')}</span>
      <span class="bd-val num">${fmt(r.clicks)}</span>
      <span class="bd-pct">${Math.round(100 * r.clicks / totalBd(rows))}%</span>
    </div>`).join('') : `<div class="empty" style="padding:20px"><div>No data yet</div></div>`;

  document.getElementById('dash-body').innerHTML = `
    ${backHash ? `<div style="margin-bottom:14px"><a class="btn ghost sm" href="${backHash}">← Back</a></div>` : ''}
    <div class="card"><div class="card-title">Clicks over time</div><div class="chart-box"><canvas id="c-series"></canvas></div></div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">🏆 Agent leaderboard</div>
        ${d.leaderboard.length ? d.leaderboard.slice(0, 10).map((l, i) => `
          <div class="lb-row">
            <div class="lb-rank ${i === 0 ? 'top' : ''}">${i + 1}</div>
            <div class="lb-name" title="${esc(l.agent)}">${esc(l.agent)}</div>
            <div class="lb-bar-wrap"><div class="lb-bar" style="width:${Math.max(2, 100 * l.clicks / maxLb)}%"></div></div>
            <div class="lb-val num">${fmt(l.clicks)}<small>${fmt(l.uniques)} unique</small></div>
          </div>`).join('') : `<div class="empty"><div class="e-ico">🏆</div><div class="e-title">No clicks yet</div>Share your agent links to see the race.</div>`}
      </div>
      <div class="card"><div class="card-title">Devices</div><div class="chart-box short"><canvas id="c-devices"></canvas></div></div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><div class="card-title">Traffic sources</div>${bdList(d.referrers)}</div>
      <div class="card"><div class="card-title">Countries</div>${bdList(d.countries, flagEmoji)}</div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><div class="card-title">Browsers</div><div class="chart-box short"><canvas id="c-browsers"></canvas></div></div>
      <div class="card"><div class="card-title">Operating systems</div>${bdList(d.os)}</div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-title">Peak hours</div>${heatmapHtml(d.heatmap)}</div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">Recent clicks</div>
      ${d.recent.length ? d.recent.map(r => `
        <div class="feed-row">
          <div class="feed-ico">${DEVICE_ICONS[r.device] || '💻'}</div>
          <div class="feed-main">
            <div><b>${esc(r.agent)}</b> · ${flagEmoji(r.country)} ${esc(r.city !== 'Unknown' ? r.city + ', ' : '')}${esc(r.country || '')}</div>
            <div class="feed-meta">${esc(r.browser)} · ${esc(r.os)} · via ${esc(r.referrer_domain)}</div>
          </div>
          <div class="feed-time">${timeAgo(r.ts)}</div>
        </div>`).join('') : `<div class="empty"><div class="e-ico">👆</div><div class="e-title">Waiting for the first click</div>Clicks appear here in real time.</div>`}
    </div>

    <div class="head-actions" style="margin-top:16px">
      <a class="btn secondary sm" href="/api/analytics/export/clicks.csv?${q}" download>⬇️ Export clicks CSV</a>
      <a class="btn secondary sm" href="/api/analytics/export/agents.csv?${q}" download>⬇️ Export agent summary CSV</a>
    </div>`;

  lineChart('c-series', d.series, d.unit);
  donutChart('c-devices', d.devices);
  barChart('c-browsers', d.browsers.slice(0, 6));
}

/* ================= Campaigns ================= */
async function renderCampaigns() {
  shell(`<div class="page-head"><div><div class="page-title">Campaigns</div>
    <div class="page-sub">One destination, one tracked link per agent</div></div>
    ${state.user.role === 'admin' ? '<button class="btn" onclick="newCampaignModal()">＋ New Campaign</button>' : ''}</div>
    <div id="camp-list"><div class="card"><div class="skel" style="height:120px"></div></div></div>`, 'campaigns');
  let data;
  try { data = await api.get('/api/campaigns'); } catch (e) { return toast(e.message, true); }
  document.getElementById('camp-list').innerHTML = data.campaigns.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
    ${data.campaigns.map(c => `
      <div class="card" style="cursor:pointer" onclick="location.hash='#/campaign/${c.id}'">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="font-weight:700;font-size:17px;letter-spacing:-0.02em">${esc(c.name)}</div>
          <span class="pill">${c.link_count} agent${c.link_count === 1 ? '' : 's'}</span>
        </div>
        <div class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px">${esc(c.destination)}</div>
        <div style="display:flex;gap:18px;margin-top:14px">
          <div><div class="t-label" style="font-size:11px;color:var(--muted)">CLICKS</div><div style="font-weight:800;font-size:22px" class="num">${fmt(c.total_clicks)}</div></div>
          <div><div class="t-label" style="font-size:11px;color:var(--muted)">UNIQUE</div><div style="font-weight:800;font-size:22px" class="num">${fmt(c.unique_clicks)}</div></div>
        </div>
      </div>`).join('')}</div>`
    : `<div class="card"><div class="empty"><div class="e-ico">🎯</div><div class="e-title">No campaigns yet</div>
       Create one, add your agents, and each gets a unique tracked link.<br><br>
       ${state.user.role === 'admin' ? '<button class="btn" onclick="newCampaignModal()">＋ Create your first campaign</button>' : 'Ask an admin to assign you a link.'}</div></div>`;
}

function newCampaignModal() {
  const m = openModal(`
    <h3>New Campaign</h3>
    <form id="camp-form">
      <div class="field"><label>Campaign name</label><input class="input" name="name" required placeholder="Community Launch"></div>
      <div class="field"><label>Destination URL</label><input class="input" name="destination" required placeholder="https://chat.whatsapp.com/…"></div>
      <div class="field"><label>Agents (one per line)</label>
        <textarea class="input" name="agents" placeholder="Rahul&#10;Priya&#10;Aman"></textarea>
        <div class="hint">Each agent gets their own short link for the same destination.</div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn">Create</button>
      </div>
    </form>`);
  m.querySelector('#camp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const agents = f.agents.split('\n').map(s => ({ name: s.trim() })).filter(a => a.name);
    try {
      const r = await api.post('/api/campaigns', { name: f.name, destination: f.destination, agents });
      closeModal();
      toast(`Campaign created with ${r.links.length} agent link${r.links.length === 1 ? '' : 's'}`);
      location.hash = `#/campaign/${r.campaignId}`;
    } catch (err) { toast(err.message, true); }
  });
}

async function renderCampaignDetail(id) {
  shell(`<div class="card"><div class="skel" style="height:200px"></div></div>`, 'campaigns');
  let data;
  try { data = await api.get(`/api/campaigns/${id}`); } catch (e) { location.hash = '#/campaigns'; return; }
  const c = data.campaign;
  const isAdmin = state.user.role === 'admin';
  shell(`
    <div style="margin-bottom:14px"><a class="btn ghost sm" href="#/campaigns">← Campaigns</a></div>
    <div class="page-head"><div><div class="page-title">${esc(c.name)}</div>
      <div class="page-sub">${esc(c.destination)}</div></div>
      <div class="head-actions">
        <a class="btn secondary" href="#/campaign-stats/${c.id}" onclick="event.preventDefault(); campaignStats(${c.id}, '${esc(c.name).replace(/'/g, "\\'")}')">📊 Analytics</a>
        ${isAdmin ? `<button class="btn" onclick="addAgentsModal(${c.id})">＋ Add Agents</button>
        <button class="btn ghost" onclick='editCampaignModal(${JSON.stringify({ id: c.id, name: c.name, destination: c.destination })})'>✎ Edit</button>
        <button class="btn danger" onclick="delCampaign(${c.id})">🗑 Delete</button>` : ''}
      </div></div>
    <div class="card">
      <div class="card-title">Agent links</div>
      <div class="table-wrap"><table class="lp">
        <thead><tr><th>Agent</th><th>Short link</th><th>Clicks</th><th>Unique</th><th>Last click</th><th></th></tr></thead>
        <tbody>${data.links.map(l => `
          <tr>
            <td style="font-weight:600">${esc(l.agent_name || '—')}</td>
            <td><span class="slug-chip" onclick="copyText(shortUrl('${l.slug}'))" title="Click to copy">/r/${esc(l.slug)}</span></td>
            <td class="num" style="font-weight:700">${fmt(l.total_clicks)}</td>
            <td class="num">${fmt(l.unique_clicks)}</td>
            <td class="feed-meta">${timeAgo(l.last_click_at)}</td>
            <td style="white-space:nowrap">
              <button class="btn ghost sm icon-only" title="Copy link" onclick="copyText(shortUrl('${l.slug}'))">📋</button>
              <button class="btn ghost sm icon-only" title="QR code" onclick="qrModal(${l.id}, '${l.slug}')">▦</button>
              <button class="btn ghost sm icon-only" title="Link analytics" onclick="linkStats(${l.id}, '${esc(l.agent_name || l.slug).replace(/'/g, "\\'")}')">📈</button>
              ${isAdmin ? `<button class="btn ghost sm icon-only" title="Reset click data" onclick="resetClicks(${l.id}, '${esc(l.agent_name || l.slug).replace(/'/g, "\\'")}')">↺</button>
              <button class="btn danger sm icon-only" title="Delete link" onclick="delLink(${l.id}, ${c.id})">✕</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${data.links.length ? `<div style="margin-top:14px"><button class="btn secondary sm" onclick='copyAllLinks(${JSON.stringify(data.links.map(l => ({ a: l.agent_name, s: l.slug })))})'>📋 Copy all links</button></div>` : ''}
    </div>`, 'campaigns');
}

function campaignStats(id, name) { renderDashboard({ campaignId: id, title: name, backHash: `#/campaign/${id}` }); }
function linkStats(id, name) { renderDashboard({ linkId: id, title: name, backHash: location.hash }); }

function copyAllLinks(list) {
  copyText(list.map(l => `${l.a || l.s}: ${shortUrl(l.s)}`).join('\n'));
}

function editCampaignModal(c) {
  const m = openModal(`
    <h3>Edit Campaign</h3>
    <form id="edit-camp">
      <div class="field"><label>Campaign name</label><input class="input" name="name" required value="${esc(c.name)}"></div>
      <div class="field"><label>Destination URL</label><input class="input" name="destination" required value="${esc(c.destination)}">
        <div class="hint">Changing the destination updates every agent link in this campaign.</div></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn">Save</button>
      </div>
    </form>`);
  m.querySelector('#edit-camp').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/api/campaigns/${c.id}`, Object.fromEntries(new FormData(e.target)));
      closeModal(); toast('Campaign updated'); render();
    } catch (err) { toast(err.message, true); }
  });
}

async function delCampaign(id) {
  if (!confirm('Delete this campaign? All its agent links and their click data will be permanently removed.')) return;
  try {
    await api.del(`/api/campaigns/${id}`);
    toast('Campaign deleted');
    location.hash = '#/campaigns';
  } catch (e) { toast(e.message, true); }
}

async function resetClicks(id, name) {
  if (!confirm(`Reset click data for "${name}"? The link keeps working — its stats start again from zero.`)) return;
  try {
    const r = await api.del(`/api/links/${id}/clicks`);
    toast(`Cleared ${r.deleted} click${r.deleted === 1 ? '' : 's'}`);
    render();
  } catch (e) { toast(e.message, true); }
}

function addAgentsModal(campId) {
  const m = openModal(`
    <h3>Add Agents</h3>
    <form id="add-agents">
      <div class="field"><label>Agents (one per line)</label><textarea class="input" name="agents" required placeholder="Neha&#10;Vikram"></textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn">Add</button>
      </div>
    </form>`);
  m.querySelector('#add-agents').addEventListener('submit', async (e) => {
    e.preventDefault();
    const agents = new FormData(e.target).get('agents').split('\n').map(s => ({ name: s.trim() })).filter(a => a.name);
    try {
      const r = await api.post(`/api/campaigns/${campId}/agents`, { agents });
      closeModal(); toast(`Added ${r.links.length} agent link${r.links.length === 1 ? '' : 's'}`); render();
    } catch (err) { toast(err.message, true); }
  });
}

async function delLink(id, campId) {
  if (!confirm('Delete this link and all its click data?')) return;
  try { await api.del(`/api/links/${id}`); toast('Link deleted'); render(); }
  catch (e) { toast(e.message, true); }
}

function qrModal(id, slug) {
  openModal(`
    <h3>QR — /r/${esc(slug)}</h3>
    <div class="qr-box"><img src="/api/links/${id}/qr" alt="QR code"></div>
    <div class="modal-actions">
      <a class="btn secondary" href="/api/links/${id}/qr" download="qr-${esc(slug)}.png">⬇️ Download</a>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>`);
}

/* ================= Links ================= */
async function renderLinks() {
  const isAdmin = state.user.role === 'admin';
  shell(`<div class="page-head"><div><div class="page-title">Links</div>
    <div class="page-sub">Every tracked short link</div></div>
    ${isAdmin ? '<button class="btn" onclick="newLinkModal()">＋ Quick Link</button>' : ''}</div>
    <div id="links-body" class="card"><div class="skel" style="height:160px"></div></div>`, 'links');
  let data;
  try { data = await api.get('/api/links'); } catch (e) { return toast(e.message, true); }
  document.getElementById('links-body').innerHTML = data.links.length ? `
    <div class="table-wrap"><table class="lp">
      <thead><tr><th>Link</th><th>Agent</th><th>Campaign</th><th>Clicks</th><th>Unique</th><th>Active</th><th></th></tr></thead>
      <tbody>${data.links.map(l => `
        <tr>
          <td><span class="slug-chip" onclick="copyText(shortUrl('${l.slug}'))" title="${esc(l.destination)}">/r/${esc(l.slug)}</span></td>
          <td style="font-weight:600">${esc(l.agent_name || '—')}</td>
          <td class="feed-meta">${esc(l.campaign_name || '—')}</td>
          <td class="num" style="font-weight:700">${fmt(l.total_clicks)}</td>
          <td class="num">${fmt(l.unique_clicks)}</td>
          <td>${isAdmin ? `<label class="switch"><input type="checkbox" ${l.active ? 'checked' : ''} onchange="toggleLink(${l.id}, this.checked)"><span class="track"></span></label>`
                        : `<span class="pill ${l.active ? 'on' : 'off'}">${l.active ? 'Active' : 'Paused'}</span>`}</td>
          <td style="white-space:nowrap">
            <button class="btn ghost sm icon-only" title="QR" onclick="qrModal(${l.id}, '${l.slug}')">▦</button>
            <button class="btn ghost sm icon-only" title="Analytics" onclick="linkStats(${l.id}, '${esc(l.agent_name || l.slug).replace(/'/g, "\\'")}')">📈</button>
            ${isAdmin ? `<button class="btn danger sm icon-only" title="Delete" onclick="delLink(${l.id})">✕</button>` : ''}
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`
    : `<div class="empty"><div class="e-ico">🔗</div><div class="e-title">No links yet</div>Create a campaign or a quick link to get started.</div>`;
}

function newLinkModal() {
  const m = openModal(`
    <h3>Quick Link</h3>
    <form id="link-form">
      <div class="field"><label>Destination URL</label><input class="input" name="destination" required placeholder="https://example.com"></div>
      <div class="field"><label>Custom slug (optional)</label><input class="input" name="slug" placeholder="my-link"></div>
      <div class="field"><label>Agent / label (optional)</label><input class="input" name="agent_name" placeholder="Instagram bio"></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn">Create</button>
      </div>
    </form>`);
  m.querySelector('#link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api.post('/api/links', f);
      closeModal(); toast('Link created'); copyText(shortUrl(r.slug)); render();
    } catch (err) { toast(err.message, true); }
  });
}

async function toggleLink(id, active) {
  try { await api.patch(`/api/links/${id}`, { active }); toast(active ? 'Link activated' : 'Link paused'); }
  catch (e) { toast(e.message, true); render(); }
}

/* ================= Users ================= */
async function renderUsers() {
  shell(`<div class="page-head"><div><div class="page-title">Team</div>
    <div class="page-sub">Admins & agent accounts</div></div>
    <button class="btn" onclick="newUserModal()">＋ Add Member</button></div>
    <div id="users-body" class="card"><div class="skel" style="height:160px"></div></div>`, 'users');
  let data;
  try { data = await api.get('/api/users'); } catch (e) { return toast(e.message, true); }
  document.getElementById('users-body').innerHTML = `
    <div class="table-wrap"><table class="lp">
      <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Links</th><th></th></tr></thead>
      <tbody>${data.users.map(u => `
        <tr>
          <td><div style="font-weight:600">${esc(u.name)}</div><div class="feed-meta">${esc(u.email)}</div></td>
          <td><span class="pill ${u.role === 'admin' ? 'role-admin' : ''}">${u.role}</span></td>
          <td>${u.approved ? '<span class="pill on">Approved</span>' : `<button class="btn sm" onclick="approveUser(${u.id})">Approve</button>`}</td>
          <td class="num">${u.link_count}</td>
          <td style="white-space:nowrap">
            ${u.id !== state.user.id ? `
              <button class="btn ghost sm" onclick="setRole(${u.id}, '${u.role === 'admin' ? 'user' : 'admin'}')">${u.role === 'admin' ? 'Make user' : 'Make admin'}</button>
              <button class="btn danger sm icon-only" onclick="delUser(${u.id})">✕</button>` : '<span class="feed-meta">you</span>'}
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function newUserModal() {
  const m = openModal(`
    <h3>Add Member</h3>
    <form id="user-form">
      <div class="field"><label>Full name</label><input class="input" name="name" required></div>
      <div class="field"><label>Email</label><input class="input" type="email" name="email" required></div>
      <div class="field"><label>Password</label><input class="input" name="password" required minlength="6"></div>
      <div class="field"><label>Role</label><select class="input" name="role"><option value="user">Agent (user)</option><option value="admin">Admin</option></select></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn">Create</button>
      </div>
    </form>`);
  m.querySelector('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/users', Object.fromEntries(new FormData(e.target)));
      closeModal(); toast('Member added'); render();
    } catch (err) { toast(err.message, true); }
  });
}

async function approveUser(id) { try { await api.patch(`/api/users/${id}`, { approved: true }); toast('Approved'); render(); } catch (e) { toast(e.message, true); } }
async function setRole(id, role) { try { await api.patch(`/api/users/${id}`, { role }); toast('Role updated'); render(); } catch (e) { toast(e.message, true); } }
async function delUser(id) {
  if (!confirm('Delete this member? Their links remain but lose the owner.')) return;
  try { await api.del(`/api/users/${id}`); toast('Member deleted'); render(); } catch (e) { toast(e.message, true); }
}

/* ================= Settings ================= */
async function renderSettings() {
  const isAdmin = state.user.role === 'admin';
  shell(`<div class="page-head"><div><div class="page-title">Settings</div></div></div>
    <div class="card"><div class="card-title">Appearance</div>${themeCardsHtml()}</div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">Change password</div>
      <form id="pw-form" style="max-width:340px">
        <div class="field"><label>Current password</label><input class="input" type="password" name="current" required></div>
        <div class="field"><label>New password</label><input class="input" type="password" name="next" required minlength="6"></div>
        <button class="btn">Update Password</button>
      </form>
    </div>

    ${isAdmin ? `
    <div class="card" style="margin-top:16px">
      <div class="card-title">Backup & data safety</div>
      <div id="backup-status" class="hint" style="margin-bottom:12px">Loading…</div>
      <div class="head-actions">
        <a class="btn secondary" href="/api/backup/export" download>⬇️ Export backup</a>
        <button class="btn ghost" onclick="document.getElementById('restore-file').click()">⬆️ Restore from file</button>
        <button class="btn ghost" id="gh-backup-btn" onclick="ghBackupNow()" style="display:none">☁️ Back up to GitHub now</button>
        <input type="file" id="restore-file" accept="application/json" style="display:none">
      </div>
      <div class="hint" style="margin-top:12px">
        Render's free plan wipes the disk on every deploy. Download a backup regularly, or set
        <b>GITHUB_TOKEN</b> + <b>BACKUP_REPO</b> env vars for automatic free backups every 30 min (auto-restores on boot).
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">Keep-alive (Render free plan)</div>
      <div style="font-size:14px; color:var(--text-2); line-height:1.7">
        Render free services sleep after 15 min of inactivity, which delays clicks by ~50s while waking.
        Fix it free:<br>
        1. Create a free account at <b>uptimerobot.com</b> (or cron-job.org)<br>
        2. Add an HTTP monitor pointing to <span class="slug-chip" onclick="copyText(location.origin + '/api/health')">${location.origin}/api/health</span><br>
        3. Set the interval to <b>every 5–10 minutes</b> — your app stays awake 24/7.
      </div>
    </div>` : ''}`, 'settings');

  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/password', Object.fromEntries(new FormData(e.target)));
      toast('Password updated'); e.target.reset();
    } catch (err) { toast(err.message, true); }
  });

  if (isAdmin) {
    document.getElementById('restore-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Restoring replaces ALL current data with the backup. Continue?')) { e.target.value = ''; return; }
      try {
        const dump = JSON.parse(await file.text());
        const r = await api.post('/api/backup/import', dump);
        toast('Backup restored');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast(err.message, true); }
    });
    try {
      const s = await api.get('/api/backup/status');
      const el = document.getElementById('backup-status');
      el.innerHTML = `Database: <b>${fmt(s.counts.clicks)}</b> clicks · <b>${s.counts.links}</b> links · <b>${s.counts.users}</b> users
        &nbsp;|&nbsp; GitHub auto-backup: <b>${s.github_enabled ? 'ON ✅' : 'off'}</b>
        ${s.last_backup_at ? `&nbsp;|&nbsp; Last backup: ${timeAgo(s.last_backup_at)}` : ''}`;
      if (s.github_enabled) document.getElementById('gh-backup-btn').style.display = '';
    } catch { /* non-admin or error */ }
  }
}

async function ghBackupNow() {
  try { await api.post('/api/backup/github'); toast('Backed up to GitHub'); render(); }
  catch (e) { toast(e.message, true); }
}

boot();
