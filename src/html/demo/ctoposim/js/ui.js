/* =========================================================================
   CTopoSim — Βοηθητικά UI, αποθήκευση κατάστασης, CSV
   ========================================================================= */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false)
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return e;
}

function toast(msg, kind = "info", ms = 4500) {
  const t = h("div", { class: "toast " + kind }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.classList.add("hide"), ms);
  setTimeout(() => t.remove(), ms + 600);
}

function download(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** διαβάζει CSV/TXT ως κείμενο· ένα .xlsx μετατρέπεται σε κείμενο με στηλοθέτες (πρώτο φύλλο) */
function readFile(input) {
  return new Promise((res, rej) => {
    const f = input.files && input.files[0];
    if (!f) return rej(new Error("Δεν επιλέχθηκε αρχείο"));
    const xlsx = /\.xlsx$/i.test(f.name);
    const r = new FileReader();
    r.onload = async () => {
      if (!xlsx) return res({ name: f.name, text: r.result });
      try {
        const rows = await Sheet.readXLSX(r.result);
        res({ name: f.name, text: rows.map(x => x.map(c => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n") });
      } catch (e) { rej(e); }
    };
    r.onerror = () => rej(r.error);
    if (xlsx) r.readAsArrayBuffer(f); else r.readAsText(f, "utf-8");
  });
}

/** άνοιγμα εκτυπώσιμης σελίδας με ένα ή περισσότερα φύλλα (το καθένα σε νέα σελίδα) */
function printGrids(title, grids, landscape = true) {
  const body = grids.map((g, i) => `<section${i ? ' class="pb"' : ""}>${Sheet.toHTML(g)}</section>`).join("");
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:14px;color:#000}button{margin-bottom:10px;padding:6px 12px}
.pb{break-before:page;page-break-before:always;margin-top:24px}${Sheet.PRINT_CSS}
@media print{button{display:none}.pb{margin-top:0}@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:9mm}}</style></head><body>
<button onclick="print()">🖨 Εκτύπωση / PDF</button>${body}</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast("Ο browser μπλόκαρε το νέο παράθυρο.", "warn");
  w.document.write(html); w.document.close();
}

/** στοιχεία κεφαλίδας εντύπου υπαίθρου (ημερομηνία, ώρα, όργανο, παρατηρητής, καιρός) */
function fieldMeta(created, key) {
  const st = Store.s, d = new Date(created || Date.now());
  const rng = RNG.make(`weather|${st.student.am}|${key}|${created}`);
  const sky = ["Αίθριος", "Αίθριος", "Λίγες νεφώσεις", "Λίγες νεφώσεις", "Αραιές νεφώσεις", "Συννεφιά"];
  const wind = ["νηνεμία", "ασθενής άνεμος", "ασθενής άνεμος", "μέτριος άνεμος"];
  const pick = a => a[Math.floor(rng.next() * a.length)];
  const T = Math.round(rng.uniform(12, 30));
  return {
    date: d.toLocaleDateString("el-GR"),
    time: d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    instrument: "Γεωδαιτικός σταθμός (CTopoSim)",
    observer: `${st.student.name}${st.student.am ? " (" + st.student.am + ")" : ""}`,
    weather: `${pick(sky)}, ${pick(wind)}, ${T} °C`,
  };
}

/* ---------------- Κατάσταση εφαρμογής (localStorage) ---------------- */
const Store = (() => {
  const KEY = "ctoposim.v1";
  const defaults = () => ({
    version: 1,
    student: { name: "", am: "" },
    settings: { reduction: "k", distribution: "length", sigB: [3, 10], sigD: [1, 5], decimal: ".",
                iRange: [1.45, 1.75], iTyp: [1.55, 1.65], tH: 1.5, periods: 2 },
    area: null, points: {}, seq: [], finished: false, nextId: 1, seedSalt: 0,
    obs: null,
    attempts: { p3: 0, p4: 0, p5: 0, p6: 0 },
    results: { p3: null, p4: null, p5: null, p6: null },
    geo: null,
    tachy: { setups: [], cur: null, nextP: 1 },
  });
  let state = defaults();
  /** παλιά έργα: συμπλήρωση των ρυθμίσεων που προστέθηκαν αργότερα */
  const merge = s => {
    const m = Object.assign(defaults(), s);
    m.settings = Object.assign(defaults().settings, s.settings || {});
    m.attempts = Object.assign(defaults().attempts, s.attempts || {});
    m.results = Object.assign(defaults().results, s.results || {});
    return m;
  };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.version === 1) state = merge(s);
    } catch (e) { /* αγνόησε */ }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Αποτυχία αποθήκευσης στον browser", "err"); }
  }
  function reset() { state = defaults(); save(); return state; }
  function replace(s) {
    if (!s || s.version !== 1) throw new Error("Μη έγκυρο αρχείο έργου");
    state = merge(s); save(); return state;
  }
  return { get s() { return state; }, load, save, reset, replace, defaults };
})();

/* ---------------- CSV ---------------- */
const CSV = (() => {
  /** αριθμός → κείμενο με το επιλεγμένο δεκαδικό διαχωριστικό */
  const num = (x, d) => (x == null || !isFinite(x)) ? "" :
    Number(x).toFixed(d).replace(".", Store.s.settings.decimal);
  function build(rows) {
    return "﻿" + rows.map(r => r.map(c => {
      const s = c == null ? "" : String(c);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";")).join("\r\n") + "\r\n";
  }
  function parse(text) {
    text = text.replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!lines.length) return [];
    const first = lines.find(l => /\d/.test(l)) || lines[0];
    const count = ch => (first.match(new RegExp("\\" + ch, "g")) || []).length;
    const delim = text.includes("\t") ? "\t" : count(";") ? ";" : ",";
    return lines.map(l => l.split(delim).map(c => c.trim().replace(/^"(.*)"$/, "$1")));
  }
  /** διαβάζει αριθμό με τελεία ή κόμμα ως δεκαδικό */
  function toNum(s) {
    if (s == null) return NaN;
    const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
    return t === "" ? NaN : Number(t);
  }
  return { num, build, parse, toNum };
})();
