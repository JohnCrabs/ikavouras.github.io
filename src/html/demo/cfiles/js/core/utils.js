/* CFiles — shared helpers (global namespace: window.CF) */
(function () {
  'use strict';
  const CF = (window.CF = window.CF || {});
  CF.viewers = CF.viewers || {};
  const U = (CF.util = {});

  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'readOnly', 'tabIndex', 'rows', 'size']);

  /** Tiny DOM builder: U.el('div', {class:'x', onclick: fn}, child1, 'text') */
  U.el = function (tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (PROPS.has(k)) node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : String(c));
    }
    return node;
  };

  U.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.formatBytes = function (n) {
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n < 10 ? 2 : 1) + ' ' + u[i];
  };

  U.extOf = (name) => { const m = /\.([^.\\/]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  U.replaceExt = (name, ext) => (/\.[^.\\/]+$/.test(name) ? name.replace(/\.[^.\\/]+$/, '.' + ext) : name + '.' + ext);

  U.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  U.debounce = function (fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  U.store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  U.MIME = {
    json: 'application/json', yaml: 'application/yaml', csv: 'text/csv',
    txt: 'text/plain', bin: 'application/octet-stream',
  };

  U.download = function (name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = U.el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /** Save using the File System Access API when available, else a normal download. Returns false if cancelled. */
  U.saveFile = async function (name, data, mime) {
    if (window.showSaveFilePicker && window.isSecureContext) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const w = await handle.createWritable();
        await w.write(data instanceof Blob ? data : new Blob([data], { type: mime }));
        await w.close();
        return handle.name || name;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        // Fall through to a regular download on any other error.
      }
    }
    U.download(name, data, mime);
    return name;
  };

  U.toast = function (msg, kind = 'info', ms = 3800) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const t = U.el('div', { class: 'toast ' + kind, role: 'status', text: msg });
    host.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, ms);
    setTimeout(() => t.remove(), ms + 350);
  };

  /** Insert text into a textarea keeping the native undo stack when possible. */
  U.insertText = function (ta, text) {
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  /** Segmented control helper */
  U.seg = function (items, value, onChange) {
    const wrap = U.el('div', { class: 'seg', role: 'group' });
    const set = (v) => { for (const b of wrap.children) b.classList.toggle('on', b.dataset.v === String(v)); };
    for (const [v, label, title] of items) {
      wrap.append(U.el('button', { type: 'button', text: label, title: title || null, dataset: { v }, onclick: () => { set(v); onChange(v); } }));
    }
    set(value);
    wrap.set = set;
    return wrap;
  };

  U.hasYaml = () => typeof window.jsyaml !== 'undefined';
})();
