/* Tiny fetch wrapper — all API calls go through here */
const api = {
  async req(method, url, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get: (url) => api.req('GET', url),
  post: (url, body) => api.req('POST', url, body),
  patch: (url, body) => api.req('PATCH', url, body),
  del: (url) => api.req('DELETE', url)
};
