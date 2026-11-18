/* CFiles — smart file-type detection (extension hints + content sniffing) */
(function () {
  'use strict';
  const U = CF.util;
  const D = (CF.detect = {});

  const BIN_EXT = new Set([
    'bin', 'dat', 'exe', 'dll', 'so', 'o', 'obj', 'img', 'iso', 'rom', 'hex16',
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'pdf',
    'zip', 'gz', '7z', 'rar', 'tar', 'xz', 'bz2', 'class', 'wasm',
    'mp3', 'mp4', 'wav', 'ogg', 'flac', 'avi', 'mkv', 'db', 'sqlite', 'woff', 'woff2', 'ttf', 'otf',
  ]);
  const EXT_TYPE = {
    json: 'json', geojson: 'json', jsonc: 'json', webmanifest: 'json',
    yml: 'yaml', yaml: 'yaml',
    csv: 'csv', tsv: 'csv', tab: 'csv',
    txt: 'txt', log: 'txt', md: 'txt', ini: 'txt', cfg: 'txt', conf: 'txt', text: 'txt',
  };

  /** Heuristic: does this byte sample look binary? */
  D.isBinary = function (bytes) {
    if (!bytes.length) return false;
    // UTF-16 BOMs are text.
    if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return false;
    const n = Math.min(bytes.length, 8192);
    let ctrl = 0;
    for (let i = 0; i < n; i++) {
      const b = bytes[i];
      if (b === 0) return true;
      if ((b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12 && b !== 8 && b !== 27) || b === 127) ctrl++;
    }
    return ctrl / n > 0.05;
  };

  /** Decode text bytes: honours BOMs, tries strict UTF-8, falls back to Greek Windows-1253. */
  D.decodeText = function (bytes) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 (BOM)' };
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE' };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE' };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1253').decode(bytes), encoding: 'Windows-1253' };
    }
  };

  const YAML_LINE = /^\s*(-\s+\S|-\s*$|---\s*$|\.\.\.\s*$|(?:"[^"]*"|'[^']*'|[^\s:#'"\-{[][^:#]{0,80}):(\s|$))/;

  /** Structured-line ratio + successful parse into an object/array. */
  D.looksYaml = function (text) {
    if (!U.hasYaml()) return false;
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
    if (lines.length < 2) return false;
    let structured = 0;
    for (const l of lines) {
      const m = YAML_LINE.exec(l);
      if (!m) continue;
      // Reject prose like "Note that the thing: blah" (keys with many words).
      const key = l.trim().split(':')[0];
      if (!l.trim().startsWith('-') && key.split(/\s+/).length > 4) continue;
      structured++;
    }
    if (structured < 2 || structured / lines.length < 0.6) return false;
    try {
      const docs = [];
      jsyaml.loadAll(text, (d) => docs.push(d), { schema: jsyaml.CORE_SCHEMA });
      return docs.some((d) => d && typeof d === 'object');
    } catch (e) {
      return false;
    }
  };

  /** Decide the type of a text. Returns {type, reason, delimiter?}. */
  D.sniffText = function (text, ext) {
    const byExt = EXT_TYPE[ext];
    if (byExt) {
      const r = { type: byExt, reason: `by extension .${ext}` };
      if (byExt === 'csv') {
        const s = CF.csv.sniff(text);
        r.delimiter = ext === 'tsv' || ext === 'tab' ? '\t' : s ? s.delimiter : ',';
      }
      return r;
    }
    const t = text.trim();
    if (!t) return { type: 'txt', reason: 'empty content' };
    if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']'))) {
      try { JSON.parse(t); return { type: 'json', reason: 'content is valid JSON' }; } catch (e) { /* not JSON */ }
    }
    if (D.looksYaml(text)) return { type: 'yaml', reason: 'content looks like YAML (key: value / - items)' };
    const s = CF.csv.sniff(text);
    if (s && s.columns >= 2) {
      const name = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }[s.delimiter];
      return { type: 'csv', reason: `content is tabular (${s.columns} columns, ${name}-separated)`, delimiter: s.delimiter };
    }
    return { type: 'txt', reason: 'plain text' };
  };

  /** Full detection from a file name + bytes. */
  D.detect = function (name, bytes) {
    const ext = U.extOf(name);
    if (BIN_EXT.has(ext)) return { type: 'bin', reason: `by extension .${ext}` };
    if (D.isBinary(bytes)) return { type: 'bin', reason: 'content contains binary data' };
    const { text, encoding } = D.decodeText(bytes);
    const s = D.sniffText(text, ext);
    return Object.assign({ text, encoding }, s);
  };
})();
