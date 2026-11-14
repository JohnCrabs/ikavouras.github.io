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
  const blob = new Blob([text], { type: mime });
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function readFile(input) {
  return new Promise((res, rej) => {
    const f = input.files && input.files[0];
    if (!f) return rej(new Error("Δεν επιλέχθηκε αρχείο"));
    const r = new FileReader();
    r.onload = () => res({ name: f.name, text: r.result });
    r.onerror = () => rej(r.error);
    r.readAsText(f, "utf-8");
  });
}

/* ---------------- Κατάσταση εφαρμογής (localStorage) ---------------- */
const Store = (() => {
  const KEY = "ctoposim.v1";
  const defaults = () => ({
    version: 1,
    student: { name: "", am: "" },
    settings: { reduction: "k", distribution: "length", sigB: [3, 10], sigD: [1, 5], decimal: ".",
                iRange: [1.45, 1.75], iTyp: [1.55, 1.65], tH: 1.5 },
    area: null, points: {}, seq: [], finished: false, nextId: 1, seedSalt: 0,
    obs: null,
    attempts: { p3: 0, p4: 0, p5: 0 },
    results: { p3: null, p4: null, p5: null },
    tachy: { setups: [], cur: null, nextP: 1 },
  });
  let state = defaults();
  /** παλιά έργα: συμπλήρωση των ρυθμίσεων που προστέθηκαν αργότερα */
  const merge = s => {
    const m = Object.assign(defaults(), s);
    m.settings = Object.assign(defaults().settings, s.settings || {});
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
    const delim = count("\t") ? "\t" : count(";") ? ";" : ",";
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
