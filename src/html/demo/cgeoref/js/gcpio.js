/* CGeoRef – Εισαγωγή / εξαγωγή σημείων ελέγχου */
(function (GR) {
  'use strict';

  /** QGIS .points (sourceY αρνητικό, όπως στον Georeferencer του QGIS) */
  function toPoints(gcps, fitResult, wkt) {
    const lines = [];
    if (wkt) lines.push('#CRS: ' + wkt);
    lines.push('mapX,mapY,sourceX,sourceY,enable,dX,dY,residual');
    gcps.forEach((g, i) => {
      const r = fitResult && fitResult.ok ? fitResult.res[i] : null;
      lines.push([g.dst[0], g.dst[1], g.src[0], -g.src[1], g.enabled ? 1 : 0,
        r ? r.dx : 0, r ? -r.dy : 0, r ? r.dPx : 0].join(','));
    });
    return lines.join('\n') + '\n';
  }

  function toCSV(gcps, fitResult) {
    const lines = ['id,source_x,source_y,map_x,map_y,enabled,res_x_px,res_y_px,res_px,res_map'];
    gcps.forEach((g, i) => {
      const r = fitResult && fitResult.ok ? fitResult.res[i] : null;
      lines.push([g.id, g.src[0], g.src[1], g.dst[0], g.dst[1], g.enabled ? 1 : 0,
        r ? r.dx : '', r ? r.dy : '', r ? r.dPx : '', r ? r.dMap : ''].join(','));
    });
    return lines.join('\n') + '\n';
  }

  /** Ανάγνωση .points / CSV / JSON. Επιστρέφει { gcps, crsWkt, project } */
  function parse(text, name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'json' || /^\s*\{/.test(text)) {
      const j = JSON.parse(text);
      return { gcps: (j.gcps || []).map(normalize), project: j };
    }
    const rows = text.split(/\r?\n/);
    let crsWkt = null;
    const gcps = [];
    let header = null;
    for (const raw of rows) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) { const m = line.match(/^#CRS:\s*(.*)$/); if (m) crsWkt = m[1]; continue; }
      const parts = line.split(/[,;\t]/).map(s => s.trim());
      if (!header && parts.some(p => /[a-zA-Z_]/.test(p) && isNaN(parseFloat(p)))) { header = parts.map(p => p.toLowerCase()); continue; }
      const num = parts.map(Number);
      let g;
      if (header && header.includes('mapx')) {
        const H = (k) => num[header.indexOf(k)];
        g = { src: [H('sourcex'), Math.abs(H('sourcey'))], dst: [H('mapx'), H('mapy')], enabled: header.includes('enable') ? H('enable') !== 0 : true };
      } else if (header && header.includes('source_x')) {
        const H = (k) => num[header.indexOf(k)];
        g = { id: H('id'), src: [H('source_x'), H('source_y')], dst: [H('map_x'), H('map_y')], enabled: header.includes('enabled') ? H('enabled') !== 0 : true };
      } else {
        // χωρίς επικεφαλίδα: mapX,mapY,sourceX,sourceY[,enable] (σειρά QGIS)
        g = { src: [num[2], Math.abs(num[3])], dst: [num[0], num[1]], enabled: num.length > 4 ? num[4] !== 0 : true };
      }
      if ([g.src[0], g.src[1], g.dst[0], g.dst[1]].every(isFinite)) gcps.push(g);
    }
    return { gcps: gcps.map(normalize), crsWkt };
  }

  function normalize(g) {
    return { id: g.id, src: [+g.src[0], +g.src[1]], dst: [+g.dst[0], +g.dst[1]], enabled: g.enabled !== false };
  }

  /** Ανίχνευση EPSG από WKT (π.χ. AUTHORITY["EPSG","2100"] ή γνωστά ονόματα) */
  function epsgFromWkt(wkt) {
    if (!wkt) return null;
    const m = wkt.match(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]\s*\]*\s*$/i) || wkt.match(/ID\["EPSG",(\d+)\]\]\s*$/i);
    if (m) return 'EPSG:' + m[1];
    const all = [...wkt.matchAll(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)];
    if (all.length) return 'EPSG:' + all[all.length - 1][1];
    if (/Greek_Grid|GGRS_?87|GGRS 1987/i.test(wkt)) return 'EPSG:2100';
    if (/Pseudo.?Mercator|Web_Mercator/i.test(wkt)) return 'EPSG:3857';
    return null;
  }

  function download(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  GR.gcpio = { toPoints, toCSV, parse, epsgFromWkt, download };
})(window.GR = window.GR || {});
