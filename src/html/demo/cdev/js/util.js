// Small DOM / storage / path helpers shared by all modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const store = {
  get(key, def) {
    try { const v = localStorage.getItem('cdev.' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('cdev.' + key, JSON.stringify(val)); } catch { /* storage unavailable */ }
  },
  del(key) { try { localStorage.removeItem('cdev.' + key); } catch { /* ignore */ } },
};

export class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter(f => f !== fn); }
  emit(ev, ...args) { for (const fn of this._h[ev] || []) { try { fn(...args); } catch (e) { console.error(e); } } }
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- paths (workspace-relative, always '/') ----------
export const P = {
  norm(p) {
    const out = [];
    for (const part of String(p || '').replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return out.join('/');
  },
  join(...parts) { return P.norm(parts.filter(Boolean).join('/')); },
  dirname(p) { const n = P.norm(p); const i = n.lastIndexOf('/'); return i < 0 ? '' : n.slice(0, i); },
  basename(p) { const n = P.norm(p); return n.slice(n.lastIndexOf('/') + 1); },
  ext(p) { const b = P.basename(p); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i).toLowerCase(); },
  stem(p) { const b = P.basename(p); const i = b.lastIndexOf('.'); return i <= 0 ? b : b.slice(0, i); },
  isInside(child, parent) { return !parent || child === parent || child.startsWith(parent + '/'); },
};

// Native (OS) path helpers for building exec_settings paths.
export const NP = {
  isAbs(p) { return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p); },
  split(p) { return String(p).replace(/\\/g, '/').split('/').filter(Boolean); },
  // relative path from directory `from` to `to` (both absolute). Returns null if on different drives.
  relative(from, to, sep = '/') {
    const f = NP.split(from), t = NP.split(to);
    const win = /^[A-Za-z]:$/.test(f[0] || '') || /^[A-Za-z]:$/.test(t[0] || '');
    const eq = (a, b) => win ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (win && !eq(f[0] || '', t[0] || '')) return null;
    let i = 0;
    while (i < f.length && i < t.length && eq(f[i], t[i])) i++;
    if (i === 0 || (win && i === 1)) return null; // only the drive/root in common: keep absolute
    const up = f.slice(i).map(() => '..');
    const rel = [...up, ...t.slice(i)].join('/');
    return rel ? (rel.startsWith('..') ? rel : './' + rel) : '.';
  },
  join(a, b, sep = '/') { return (a.replace(/[\\/]+$/, '') + sep + b.replace(/^[\\/]+/, '')).replace(/[\\/]/g, sep); },
};

// ---------- toast ----------
export function toast(msg, type = 'info', ms = 3800) {
  const root = $('#toast-root');
  const el = h('div', { class: `toast ${type}` }, msg);
  root.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
  return el;
}

// ---------- modal ----------
export function modal({ title, body, buttons = [], size = '', onClose, dismissable = true }) {
  const root = $('#modal-root');
  const foot = h('div', { class: 'modal-foot' });
  const box = h('div', { class: `modal ${size}` },
    h('div', { class: 'modal-head' }, title, dismissable ? h('button', { class: 'ib x', title: 'Close', onclick: () => close() }, '✕') : null),
    h('div', { class: 'modal-body' }, body),
    buttons.length ? foot : null);
  const back = h('div', { class: 'modal-backdrop' }, box);
  let closed = false;
  function close(result) {
    if (closed) return; closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose && onClose(result);
  }
  function onKey(e) {
    if (root.lastElementChild !== back) return; // only the top-most dialog handles keys
    if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close(); }
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'INPUT' && !e.target.hasAttribute('data-nosubmit')) {
      const prim = buttons.find(b => b.primary);
      if (prim) { e.preventDefault(); run(prim); }
    }
  }
  async function run(b) {
    const r = b.onClick ? await b.onClick(close) : undefined;
    if (r !== false) close(b.value);
  }
  for (const b of buttons) {
    foot.append(h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, onclick: () => run(b) }, b.label));
  }
  back.addEventListener('mousedown', e => { if (e.target === back && dismissable) close(); });
  document.addEventListener('keydown', onKey, true);
  root.append(back);
  setTimeout(() => { const f = box.querySelector('[autofocus], input, textarea, select'); f && f.focus(); }, 30);
  return { close, el: box };
}

export function askText(title, label, value = '', placeholder = '') {
  return new Promise(resolve => {
    const input = h('input', { value, placeholder, autofocus: true, style: { width: '100%' } });
    let result = null;
    modal({
      title, body: h('div', { class: 'form' }, h('label', { class: 'f' }, h('span', {}, label), input)),
      buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { result = input.value.trim(); } }],
      onClose: () => resolve(result || null),
    });
    setTimeout(() => { input.focus(); const dot = value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : value.length); }, 40);
  });
}

export function askConfirm(title, message, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    let ok = false;
    modal({
      title, body: h('div', {}, message),
      buttons: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, onClick: () => { ok = true; } }],
      onClose: () => resolve(ok),
    });
  });
}

// ---------- context menu ----------
export function contextMenu(x, y, items) {
  const menu = $('#ctx-menu');
  menu.innerHTML = '';
  for (const it of items) {
    if (it === '-') { menu.append(h('hr')); continue; }
    if (!it) continue;
    menu.append(h('button', { onclick: () => { hide(); it.action(); } }, it.label));
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  function hide() { menu.hidden = true; document.removeEventListener('mousedown', outside, true); }
  function outside(e) { if (!menu.contains(e.target)) hide(); }
  setTimeout(() => document.addEventListener('mousedown', outside, true));
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'ok', 1500); }
  catch { toast('Copy failed', 'error'); }
}

// ---------- tiny IndexedDB key/value (for directory handles) ----------
export const idb = {
  _db: null,
  async db() {
    if (this._db) return this._db;
    this._db = await new Promise((res, rej) => {
      const r = indexedDB.open('cdev', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async get(k) {
    try {
      const db = await this.db();
      return await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    } catch { return undefined; }
  },
  async set(k, v) {
    try {
      const db = await this.db();
      await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch { /* ignore */ }
  },
};
