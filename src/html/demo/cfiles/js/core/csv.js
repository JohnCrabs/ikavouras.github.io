/* CFiles — RFC 4180 CSV parsing / serialising and delimiter sniffing */
(function () {
  'use strict';
  const CSV = (CF.csv = {});

  CSV.DELIMS = [',', ';', '\t', '|'];

  CSV.parse = function (text, d) {
    const rows = [];
    let row = [], f = '', q = false, i = 0;
    const n = text.length;
    if (text.charCodeAt(0) === 0xfeff) i = 1;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { f += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        f += c; i++; continue;
      }
      if (c === '"' && f === '') { q = true; i++; continue; }
      if (c === d) { row.push(f); f = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = ''; i++; continue;
      }
      f += c; i++;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  };

  CSV.quote = function (cell, d) {
    const s = cell == null ? '' : String(cell);
    if (s.includes(d) || s.includes('"') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  CSV.stringify = function (rows, d = ',', eol = '\n', trailing = true) {
    const out = rows.map((r) => r.map((c) => CSV.quote(c, d)).join(d)).join(eol);
    return trailing && rows.length ? out + eol : out;
  };

  function countOutsideQuotes(line, d) {
    let q = false, n = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === d && !q) n++;
    }
    return n;
  }

  /** Returns {delimiter, columns, consistency} or null when the text does not look tabular. */
  CSV.sniff = function (text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 40);
    if (lines.length < 2) return null;
    let best = null;
    for (const d of CSV.DELIMS) {
      const counts = lines.map((l) => countOutsideQuotes(l, d));
      const first = counts[0];
      if (first < 1) continue;
      const consistency = counts.filter((c) => c === first).length / counts.length;
      if (consistency < 0.8) continue;
      const score = consistency * 1000 + first;
      if (!best || score > best.score) best = { delimiter: d, columns: first + 1, consistency, score };
    }
    return best;
  };

  /** Rows (array of arrays, first row = header) -> array of objects */
  CSV.toObjects = function (rows) {
    if (!rows.length) return [];
    const head = rows[0].map((h, i) => (h && h.trim()) || 'column' + (i + 1));
    return rows.slice(1).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = CSV.autoType(r[i] ?? ''); });
      return o;
    });
  };

  CSV.autoType = function (s) {
    const t = s.trim();
    if (t === '') return '';
    if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return Number(t);
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
    if (/^null$/i.test(t)) return null;
    return s;
  };

  /** Array of objects -> rows with header (union of keys, nested values JSON-encoded). */
  CSV.fromObjects = function (arr) {
    const keys = [];
    const seen = new Set();
    for (const o of arr) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('CSV conversion needs an array of objects.');
      for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
    const rows = [keys];
    for (const o of arr) {
      rows.push(keys.map((k) => {
        const v = o[k];
        if (v == null) return '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      }));
    }
    return rows;
  };
})();
