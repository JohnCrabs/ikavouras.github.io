// Client for the local CDev runner (runner/cdev_runner.py).
import { Emitter, store } from './util.js';

// Explain the most likely reason a fetch to the local runner failed.
async function blockedHint(url) {
  const isBrave = !!(navigator.brave && await navigator.brave.isBrave().catch(() => false));
  const fromWeb = location.protocol === 'https:';
  const lines = [`Cannot reach ${url}.`, '• Is the runner window open? (start_cdev.bat / python runner/cdev_runner.py)'];
  if (fromWeb && isBrave) {
    lines.push('• Brave blocks websites from talking to localhost by default: click the icon at the left of the address bar (or the Brave lion/Shields) → allow “Localhost access” for this site, then Connect again. (Setting: brave://settings/content/localhostAccess)');
  } else if (fromWeb) {
    lines.push('• Your browser may block this site from reaching your computer: click the icon at the left of the address bar → allow “Local network access” (or “Apps on device”), then Connect again.');
  }
  lines.push('• Origin not allowed? If this page is not on *.github.io, start the runner with --allow-origin ' + location.origin);
  return lines.join('\n');
}

export class Runner extends Emitter {
  constructor() {
    super();
    this.url = '';
    this.token = '';
    this.connected = false;
    this.info = null;
  }

  async connect(url, token, { silent = false } = {}) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) url = 'http://' + url;
    this.url = url; this.token = (token || '').trim();
    try {
      const ping = await fetch(url + '/api/ping', { cache: 'no-store' }).then(r => r.json());
      if (ping.app !== 'cdev-runner') throw new Error('Not a CDev runner');
      this.info = await this.get('/api/info');
      this.connected = true;
      store.set('runner', { url: this.url, token: this.token });
      this.emit('status', true);
      return this.info;
    } catch (e) {
      this.connected = false; this.info = null;
      this.emit('status', false);
      if (!silent) throw e instanceof TypeError ? new Error(await blockedHint(url)) : e;
      return null;
    }
  }

  disconnect() {
    this.connected = false; this.info = null;
    this.emit('status', false);
  }

  _headers(json) {
    const h = { 'X-CDev-Token': this.token };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async _handle(r) {
    let j;
    try { j = await r.json(); } catch { j = { error: `HTTP ${r.status}` }; }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async get(path, query = {}) {
    const qs = new URLSearchParams(query).toString();
    try {
      return await this._handle(await fetch(this.url + path + (qs ? '?' + qs : ''), { headers: this._headers(), cache: 'no-store' }));
    } catch (e) { this._netError(e); throw e; }
  }

  async post(path, body = {}) {
    try {
      return await this._handle(await fetch(this.url + path, { method: 'POST', headers: this._headers(true), body: JSON.stringify(body) }));
    } catch (e) { this._netError(e); throw e; }
  }

  async blob(path, query = {}) {
    const qs = new URLSearchParams(query).toString();
    const r = await fetch(this.url + path + '?' + qs, { headers: this._headers() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.blob();
  }

  _netError(e) {
    if (e instanceof TypeError && this.connected) {
      this.connected = false;
      this.emit('status', false);
    }
  }

  // Stream process events via Server-Sent Events.
  stream(id, onEvent) {
    const es = new EventSource(`${this.url}/api/proc/stream?id=${encodeURIComponent(id)}&token=${encodeURIComponent(this.token)}`);
    let ended = false;
    es.onmessage = e => {
      let ev; try { ev = JSON.parse(e.data); } catch { return; }
      onEvent(ev);
      if (ev.type === 'exit') { ended = true; es.close(); }
    };
    es.onerror = () => { if (ended) es.close(); };
    return { close: () => { ended = true; es.close(); } };
  }
}
