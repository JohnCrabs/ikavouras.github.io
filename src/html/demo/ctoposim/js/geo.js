/* =========================================================================
   CTopoSim — Γεωδαιτικές βοηθητικές συναρτήσεις (ΕΓΣΑ 87, γωνίες σε grad)
   ========================================================================= */
"use strict";

proj4.defs("EPSG:2100",
  "+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 " +
  "+towgs84=-199.87,74.79,246.62,0,0,0,0 +units=m +no_defs");

const GEO = (() => {
  const R = 6371000;          // μέση ακτίνα της Γης (m)
  const K0 = 0.9996;          // συντελεστής κλίμακας στον κεντρικό μεσημβρινό
  const KAPPA = 0.13;         // συντελεστής διάθλασης
  const GR = Math.PI / 200;   // grad -> rad

  const mod = (x, m) => ((x % m) + m) % m;
  /** φέρνει μια διαφορά γωνίας στο διάστημα [-200, 200) grad */
  const wrap = x => mod(x + 200, 400) - 200;

  function toEGSA(lat, lon) {
    const [E, N] = proj4("EPSG:4326", "EPSG:2100", [lon, lat]);
    return { E, N };
  }
  function toWGS(E, N) {
    const [lon, lat] = proj4("EPSG:2100", "EPSG:4326", [E, N]);
    return { lat, lon };
  }
  /** γωνία διεύθυνσης A→B (από τον άξονα Y/Βορρά, δεξιόστροφα), σε grad */
  const azimuth = (a, b) => mod(Math.atan2(b.E - a.E, b.N - a.N) / GR, 400);
  const dist = (a, b) => Math.hypot(b.E - a.E, b.N - a.N);

  /** τοπικός συντελεστής κλίμακας ΤΜ87 σε ανατολικό E */
  function kPoint(E) {
    const x = (E - 500000) / K0, q = (x * x) / (R * R);
    return K0 * (1 + q / 2 + (q * q) / 24);
  }
  /** μέσος συντελεστής πλευράς (Simpson) */
  const kLine = (a, b) => (kPoint(a.E) + 4 * kPoint((a.E + b.E) / 2) + kPoint(b.E)) / 6;
  /** συντελεστής αναγωγής ύψους (στο ελλειψοειδές/γεωειδές) */
  const hFactor = Hm => R / (R + Hm);

  /** καμπυλότητα + διάθλαση για οριζόντια απόσταση D */
  const curvRefr = D => ((1 - KAPPA) * D * D) / (2 * R);

  const fmt = (x, d) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d);

  return { R, K0, KAPPA, GR, mod, wrap, toEGSA, toWGS, azimuth, dist,
           kPoint, kLine, hFactor, curvRefr, fmt };
})();

/* ---------- Ψευδοτυχαίοι αριθμοί με σπόρο (αναπαραγώγιμα δεδομένα) ---------- */
const RNG = (() => {
  function hash(str) {                    // FNV-1a 32 bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function make(seed) {                   // mulberry32
    let a = (typeof seed === "string" ? hash(seed) : seed) >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      uniform: (lo, hi) => lo + (hi - lo) * next(),
      gauss(mu = 0, sigma = 1) {
        let u = 0, v = 0;
        while (u === 0) u = next();
        while (v === 0) v = next();
        return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      sign: () => (next() < 0.5 ? -1 : 1),
    };
  }
  return { hash, make };
})();
