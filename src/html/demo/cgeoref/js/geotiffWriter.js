/* CGeoRef – Ελαφρύς εγγραφέας GeoTIFF (RGBA 8-bit, Deflate όταν υποστηρίζεται) */
(function (GR) {
  'use strict';

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /**
   * opts: { data: Uint8ClampedArray RGBA, width, height,
   *         originX, originY (πάνω-αριστερή γωνία), resX, resY (>0)  ή  transform: [A,B,C,D,E,F],
   *         epsg (αριθμός ή null), geographic (bool), citation, compress (bool) }
   * Επιστρέφει Blob.
   */
  /**
   * Tags γεωαναφοράς. Με opts.transform = [A, B, C, D, E, F] (γωνία pixel, PixelIsArea):
   *   X = A·στήλη + B·γραμμή + C,  Y = D·στήλη + E·γραμμή + F
   * Αν η εικόνα είναι βορράς-πάνω γράφονται ModelPixelScale + ModelTiepoint (όπως το QGIS/GDAL),
   * αλλιώς ModelTransformation (εικόνα με στροφή, χωρίς επαναδειγματοληψία).
   */
  function geoTags(opts) {
    let t = opts.transform;
    if (!t) t = [opts.resX, 0, opts.originX, 0, -opts.resY, opts.originY];
    const [A, B, C, D, E, F] = t;
    const scale = Math.max(Math.abs(A), Math.abs(E));
    const northUp = Math.abs(B) <= scale * 1e-10 && Math.abs(D) <= scale * 1e-10 && A > 0 && E < 0;
    if (northUp) return [[33550, 12, 3, [A, -E, 0]], [33922, 12, 6, [0, 0, 0, C, F, 0]]];
    return [[34264, 12, 16, [A, B, 0, C, D, E, 0, F, 0, 0, 0, 0, 0, 0, 0, 1]]];
  }

  async function write(opts) {
    const { data, width: W, height: H } = opts;
    const rowsPerStrip = Math.max(1, Math.floor(65536 / (W * 4)) || 1);
    const nStrips = Math.ceil(H / rowsPerStrip);
    const strips = [];
    let useDeflate = opts.compress !== false && typeof CompressionStream !== 'undefined';
    for (let s = 0; s < nStrips; s++) {
      const r0 = s * rowsPerStrip, r1 = Math.min(H, r0 + rowsPerStrip);
      let raw = new Uint8Array(data.buffer, data.byteOffset + r0 * W * 4, (r1 - r0) * W * 4);
      if (useDeflate) {
        const c = await deflate(raw);
        if (c) raw = c; else useDeflate = false;
      } else raw = raw.slice();
      strips.push(raw);
      if (opts.onProgress && s % 50 === 0) opts.onProgress(s / nStrips);
    }

    // GeoKeys
    const keys = [[1024, 0, 1, opts.geographic ? 2 : 1], [1025, 0, 1, 1]];
    if (opts.epsg) keys.push(opts.geographic ? [2048, 0, 1, opts.epsg] : [3072, 0, 1, opts.epsg]);
    const citation = (opts.citation || 'CGeoRef') + '|';
    keys.push([1026, 34737, citation.length, 0]);
    keys.sort((a, b) => a[0] - b[0]);
    const geoKeyDir = [1, 1, 0, keys.length].concat(...keys);

    // Ορισμός tags: [tag, type, count, values]
    // types: 2 ASCII, 3 SHORT, 4 LONG, 12 DOUBLE
    const tags = [
      [256, 4, 1, [W]], [257, 4, 1, [H]], [258, 3, 4, [8, 8, 8, 8]], [259, 3, 1, [useDeflate ? 8 : 1]],
      [262, 3, 1, [2]], [273, 4, nStrips, null /*offsets*/], [277, 3, 1, [4]], [278, 4, 1, [rowsPerStrip]],
      [279, 4, nStrips, strips.map(s => s.length)], [284, 3, 1, [1]], [305, 2, 0, 'CGeoRef'], [338, 3, 1, [2]],
      ...geoTags(opts),
      [34735, 3, geoKeyDir.length, geoKeyDir],
      [34737, 2, 0, citation]
    ];
    tags.forEach(t => { if (t[1] === 2) { t[3] = t[3] + '\0'; t[2] = t[3].length; } });
    const size = { 2: 1, 3: 2, 4: 4, 12: 8 };

    // Διάταξη: header(8) | strips | IFD | extra values
    let off = 8;
    const stripOffsets = strips.map(s => { const o = off; off += s.length; if (off % 2) off++; return o; });
    tags.find(t => t[0] === 273)[3] = stripOffsets;
    const ifdOff = off;
    const ifdSize = 2 + tags.length * 12 + 4;
    let extraOff = ifdOff + ifdSize;
    const extras = [];
    tags.forEach(t => {
      const bytes = size[t[1]] * t[2];
      if (bytes > 4) { t.ptr = extraOff; extras.push(t); extraOff += bytes; if (extraOff % 2) extraOff++; }
    });
    const total = extraOff;
    if (total > 4294967295) throw new Error('Το αρχείο υπερβαίνει τα 4GB');
    const buf = new ArrayBuffer(total);
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
    strips.forEach((s, i) => u8.set(s, stripOffsets[i]));

    const writeVals = (t, pos) => {
      for (let i = 0; i < t[2]; i++) {
        if (t[1] === 2) dv.setUint8(pos + i, t[3].charCodeAt(i) & 0x7f);
        else if (t[1] === 3) dv.setUint16(pos + i * 2, t[3][i], true);
        else if (t[1] === 4) dv.setUint32(pos + i * 4, t[3][i], true);
        else if (t[1] === 12) dv.setFloat64(pos + i * 8, t[3][i], true);
      }
    };
    dv.setUint16(ifdOff, tags.length, true);
    tags.forEach((t, i) => {
      const p = ifdOff + 2 + i * 12;
      dv.setUint16(p, t[0], true); dv.setUint16(p + 2, t[1], true); dv.setUint32(p + 4, t[2], true);
      if (t.ptr) dv.setUint32(p + 8, t.ptr, true); else writeVals(t, p + 8);
    });
    dv.setUint32(ifdOff + 2 + tags.length * 12, 0, true);
    extras.forEach(t => writeVals(t, t.ptr));
    return new Blob([buf], { type: 'image/tiff' });
  }

  GR.geotiffWriter = { write };
})(window.GR = window.GR || {});
