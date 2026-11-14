/* =========================================================================
   CTopoSim — Κτίρια σε 2.5D (προοπτική εξώθηση) πάνω στον χάρτη Leaflet,
   μαζί με τις σκοπεύσεις σε πραγματικό ύψος (όργανο → στόχος).
   ========================================================================= */
"use strict";

const Buildings3D = L.Layer.extend({
  onAdd(map) {
    this._map = map;
    if (!map.getPane("b3d")) {
      const p = map.createPane("b3d");
      p.style.zIndex = 450;
      p.style.pointerEvents = "none";
    }
    this._c = L.DomUtil.create("canvas", "b3d-canvas", map.getPane("b3d"));
    map.on("move zoomend resize viewreset", this._schedule, this);
    map.on("zoomstart", this._hide, this);
    this._redraw();
  },
  onRemove(map) {
    L.DomUtil.remove(this._c);
    map.off("move zoomend resize viewreset", this._schedule, this);
    map.off("zoomstart", this._hide, this);
  },
  redraw() { if (this._map) this._schedule(); },
  _hide() { this._c.style.display = "none"; },
  _schedule() {
    if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; this._redraw(); });
  },

  _redraw() {
    const map = this._map, c = this._c, size = map.getSize(), dpr = window.devicePixelRatio || 1;
    c.width = size.x * dpr; c.height = size.y * dpr;
    c.style.width = size.x + "px"; c.style.height = size.y + "px"; c.style.display = "";
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    if (map.getZoom() < 15) return;

    const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * 2 ** map.getZoom());
    const cam = { x: size.x / 2, y: size.y / 2 }, CZ = Math.max(size.x, size.y) * 1.1;
    const lift = (p, hm) => {
      const hp = Math.min(hm / mpp, CZ * 0.85), f = hp / (CZ - hp);
      return { x: p.x + (p.x - cam.x) * f, y: p.y + (p.y - cam.y) * f };
    };
    const toPt = (lat, lon) => map.latLngToContainerPoint([lat, lon]);
    const b = map.getBounds().pad(0.15);

    // ---- κτίρια: από τα μακρινά προς τα κοντινά ως προς την κάμερα
    const list = [];
    for (const bd of DEM.getBuildings()) {
      if (bd.bbox.n < b.getSouth() || bd.bbox.s > b.getNorth() || bd.bbox.e < b.getWest() || bd.bbox.w > b.getEast()) continue;
      const pts = bd.ring.map(([la, lo]) => toPt(la, lo));
      let mx = 0, my = 0;
      for (const p of pts) { mx += p.x; my += p.y; }
      mx /= pts.length; my /= pts.length;
      list.push({ bd, pts, d: Math.hypot(mx - cam.x, my - cam.y) });
    }
    list.sort((a, b2) => b2.d - a.d);
    const base = hh => {
      const f = Math.max(0, Math.min(1, hh / 30));
      const s = [[255, 226, 150], [246, 160, 70], [214, 70, 45], [130, 20, 45]];
      const x = f * (s.length - 1), i = Math.min(s.length - 2, Math.floor(x)), t = x - i;
      return s[i].map((v, k) => v + (s[i + 1][k] - v) * t);
    };
    const rgb = (col, k) => `rgb(${col.map(v => Math.round(Math.min(255, v * k))).join(",")})`;
    for (const { bd, pts } of list) {
      const col = base(bd.h), roof = pts.map(p => lift(p, bd.h));
      ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(60,35,20,.55)";
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], q = pts[i + 1], ra = roof[i], rq = roof[i + 1];
        const nx = q.y - a.y, ny = -(q.x - a.x), nl = Math.hypot(nx, ny) || 1;
        const shade = 0.62 + 0.3 * ((nx * -0.5 + ny * 0.8) / nl);    // φωτισμός από ΒΔ
        ctx.fillStyle = rgb(col, shade);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(q.x, q.y); ctx.lineTo(rq.x, rq.y); ctx.lineTo(ra.x, ra.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = rgb(col, 1.08);
      ctx.beginPath(); roof.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // ---- σκοπεύσεις σε πραγματικό ύψος (πάνω από το έδαφος)
    const st = Store.s;
    const groundAt = (lat, lon, fallback) => { const t = DEM.terrainAt(lat, lon); return isFinite(t) ? t : fallback; };
    const pole = (lat, lon, hm, color, r = 4) => {
      const g = toPt(lat, lon), top = lift(g, Math.max(0, hm));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(top.x, top.y, r, 0, 7); ctx.fill();
      return top;
    };
    const ray = (a, b2, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]);
    };
    const P = id => st.points[id];
    const above = p => p.H - groundAt(p.lat, p.lon, p.H);
    // όδευση: όργανο/στόχος σε ύψος 1.60 m πάνω από το σημείο
    for (let k = 0; k < st.seq.length - 1; k++) {
      const a = P(st.seq[k]), q = P(st.seq[k + 1]);
      const ta = pole(a.lat, a.lon, above(a) + 1.6, "#1b6ec2", 3), tq = pole(q.lat, q.lon, above(q) + 1.6, "#1b6ec2", 3);
      ray(ta, tq, "rgba(27,110,194,.85)", [6, 4]);
    }
    // ταχυμετρία: όργανο (H + i) → στόχος (H + t)
    for (const u of st.tachy.setups) {
      const A = P(u.station), on = u.id === st.tachy.cur;
      const ins = pole(A.lat, A.lon, above(A) + u.i, "#5b1f78", 4);
      for (const s of u.shots) {
        const tg = pole(s.lat, s.lon, s.H - groundAt(s.lat, s.lon, s.H) + s.t, s.onRoof ? "#e66101" : "#7b3294", 4);
        ray(ins, tg, on ? "rgba(123,50,148,.9)" : "rgba(120,120,120,.6)");
        ctx.fillStyle = "#2b0d3a"; ctx.font = "600 11px system-ui"; ctx.fillText(s.name, tg.x + 6, tg.y - 4);
      }
    }
  },
});
