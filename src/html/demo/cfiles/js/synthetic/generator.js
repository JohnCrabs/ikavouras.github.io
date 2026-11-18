/* CFiles — local (offline) synthetic data generator: random combinations from lookup tables */
(function () {
  'use strict';
  const DATA = CF.synthData;

  /* ---------- seeded RNG ---------- */
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function makeRng(seed) {
    let a = seed === '' || seed == null ? (Math.random() * 2 ** 32) >>> 0 : hashSeed(String(seed));
    const next = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
      float: (min, max, dp = 2) => +(next() * (max - min) + min).toFixed(dp),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      date: (from, to) => new Date(from.getTime() + next() * (to.getTime() - from.getTime())),
    };
  }

  const greeklish = (s) => {
    let out = '';
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const two = lower.slice(i, i + 2);
      if (DATA.greeklish[two]) { out += DATA.greeklish[two]; i++; continue; }
      const c = lower[i];
      out += DATA.greeklish[c] ?? c;
    }
    return out.replace(/[^a-z0-9]/g, '');
  };
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- per-record context ---------- */
  function recordCtx(r, L, index, locale) {
    const memo = {};
    const m = (k, fn) => (k in memo ? memo[k] : (memo[k] = fn()));
    const ctx = {
      index, r, L, locale,
      gender: () => m('gender', () => (r.chance(0.5) ? 'male' : 'female')),
      first: () => m('first', () => r.pick(L[ctx.gender()])),
      last: () => m('last', () => {
        if (locale === 'el') { const p = r.pick(L.lastPairs); return ctx.gender() === 'male' ? p[0] : p[1]; }
        return r.pick(L.last);
      }),
      city: () => m('city', () => r.pick(L.cities)),
      product: () => m('product', () => r.pick(L.products)),
      qty: () => m('qty', () => r.int(1, 10)),
      price: () => m('price', () => r.float(2, 1500, 2)),
      street: () => m('street', () => L.address(r.pick(L.streets), r.int(1, 220))),
      postal: () => m('postal', () => (locale === 'el' ? L.postal(r, ctx.city()[2]) : L.postal(r))),
      sentence: (min = 6, max = 14) => {
        const n = r.int(min, max);
        const w = [];
        for (let i = 0; i < n; i++) w.push(r.pick(L.words));
        return cap(w.join(' ')) + '.';
      },
    };
    return ctx;
  }

  /* ---------- field registry ---------- */
  const now = new Date();
  const yearsAgo = (y) => new Date(now.getFullYear() - y, now.getMonth(), now.getDate());

  const FIELDS = {
    id: { label: 'ID (sequential)', group: 'General', gen: (c) => c.index + 1 },
    uuid: {
      label: 'UUID', group: 'General',
      gen: (c) => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const v = c.r.int(0, 15); return (ch === 'x' ? v : (v & 0x3) | 0x8).toString(16); }),
    },
    firstName: { label: 'First name', group: 'Person', gen: (c) => c.first() },
    lastName: { label: 'Last name', group: 'Person', gen: (c) => c.last() },
    fullName: { label: 'Full name', group: 'Person', gen: (c) => `${c.first()} ${c.last()}` },
    gender: { label: 'Gender', group: 'Person', gen: (c) => (c.locale === 'el' ? (c.gender() === 'male' ? 'Άνδρας' : 'Γυναίκα') : c.gender()) },
    email: {
      label: 'Email', group: 'Person',
      gen: (c) => {
        const f = c.locale === 'el' ? greeklish(c.first()) : c.first().toLowerCase();
        const l = c.locale === 'el' ? greeklish(c.last()) : c.last().toLowerCase();
        return `${f}.${l}${c.r.chance(0.3) ? c.r.int(1, 99) : ''}@${c.r.pick(DATA.domains)}`;
      },
    },
    username: { label: 'Username', group: 'Person', gen: (c) => (c.locale === 'el' ? greeklish(c.first()) : c.first().toLowerCase()).slice(0, 6) + c.r.int(10, 9999) },
    phone: { label: 'Phone', group: 'Person', gen: (c) => c.L.phone(c.r) },
    birthDate: { label: 'Birth date', group: 'Person', gen: (c) => isoDate(c.r.date(yearsAgo(75), yearsAgo(18))) },
    age: { label: 'Age', group: 'Person', gen: (c) => c.r.int(18, 80) },
    address: { label: 'Address (street)', group: 'Location', gen: (c) => c.street() },
    city: { label: 'City', group: 'Location', gen: (c) => c.city()[0] },
    postalCode: { label: 'Postal code', group: 'Location', gen: (c) => c.postal() },
    country: { label: 'Country', group: 'Location', gen: (c) => c.city()[1] },
    latitude: { label: 'Latitude', group: 'Location', gen: (c) => (c.locale === 'el' ? c.r.float(35.0, 41.5, 6) : c.r.float(-60, 70, 6)) },
    longitude: { label: 'Longitude', group: 'Location', gen: (c) => (c.locale === 'el' ? c.r.float(19.5, 28.2, 6) : c.r.float(-170, 170, 6)) },
    company: { label: 'Company', group: 'Work', gen: (c) => `${c.r.pick(DATA.companyA)} ${c.r.pick(DATA.companyB)} ${c.r.pick(DATA.companyC)}` },
    jobTitle: { label: 'Job title', group: 'Work', gen: (c) => c.r.pick(c.L.jobs) },
    department: { label: 'Department', group: 'Work', gen: (c) => c.r.pick(c.L.departments) },
    salary: { label: 'Salary', group: 'Work', gen: (c) => c.r.int(14, 120) * 1000 },
    hireDate: { label: 'Hire date', group: 'Work', gen: (c) => isoDate(c.r.date(yearsAgo(20), now)) },
    sku: { label: 'SKU', group: 'Commerce', gen: (c) => `SKU-${String.fromCharCode(65 + c.r.int(0, 25))}${String.fromCharCode(65 + c.r.int(0, 25))}-${c.r.int(1000, 9999)}` },
    product: { label: 'Product', group: 'Commerce', gen: (c) => c.product()[0] },
    category: { label: 'Category', group: 'Commerce', gen: (c) => c.product()[1] },
    price: { label: 'Price', group: 'Commerce', gen: (c) => c.price() },
    quantity: { label: 'Quantity', group: 'Commerce', gen: (c) => c.qty() },
    total: { label: 'Total (qty × price)', group: 'Commerce', gen: (c) => +(c.qty() * c.price()).toFixed(2) },
    orderDate: { label: 'Order date', group: 'Commerce', gen: (c) => isoDate(c.r.date(yearsAgo(2), now)) },
    status: { label: 'Order status', group: 'Commerce', gen: (c) => c.r.pick(c.L.statuses) },
    rating: { label: 'Rating (1–5)', group: 'Commerce', gen: (c) => c.r.float(1, 5, 1) },
    active: { label: 'Active (boolean)', group: 'General', gen: (c) => c.r.chance(0.75) },
    color: { label: 'Color', group: 'General', gen: (c) => c.r.pick(c.L.colors) },
    url: { label: 'URL', group: 'Internet', gen: (c) => `https://www.${c.r.pick(DATA.domains)}/${c.r.pick(c.L === DATA.el ? DATA.en.words : c.L.words)}/${c.r.int(1, 999)}` },
    ipv4: { label: 'IPv4', group: 'Internet', gen: (c) => `10.${c.r.int(0, 255)}.${c.r.int(0, 255)}.${c.r.int(1, 254)}` },
    timestamp: { label: 'Timestamp (ISO)', group: 'IoT', gen: (c) => new Date(now.getTime() - (c.index * 60000) - c.r.int(0, 59999)).toISOString() },
    sensorId: { label: 'Sensor ID', group: 'IoT', gen: (c) => `S-${String(c.r.int(1, 64)).padStart(3, '0')}` },
    temperature: { label: 'Temperature °C', group: 'IoT', gen: (c) => c.r.float(-5, 42, 1) },
    humidity: { label: 'Humidity %', group: 'IoT', gen: (c) => c.r.float(15, 98, 1) },
    sensorStatus: { label: 'Sensor status', group: 'IoT', gen: (c) => c.r.pick(c.L.sensorStatus) },
    sentence: { label: 'Sentence', group: 'Text', gen: (c) => c.sentence() },
    paragraph: { label: 'Paragraph', group: 'Text', gen: (c) => Array.from({ length: c.r.int(3, 5) }, () => c.sentence()).join(' ') },
  };

  const PRESETS = {
    people: { label: 'People', fields: ['id', 'firstName', 'lastName', 'gender', 'email', 'phone', 'birthDate', 'city', 'country', 'active'] },
    employees: { label: 'Employees', fields: ['id', 'fullName', 'email', 'company', 'department', 'jobTitle', 'salary', 'hireDate'] },
    products: { label: 'Products', fields: ['sku', 'product', 'category', 'price', 'quantity', 'rating', 'color', 'active'] },
    orders: { label: 'Orders', fields: ['id', 'orderDate', 'fullName', 'product', 'quantity', 'price', 'total', 'status', 'city'] },
    addresses: { label: 'Addresses', fields: ['id', 'fullName', 'address', 'postalCode', 'city', 'country', 'latitude', 'longitude'] },
    sensors: { label: 'IoT sensor readings', fields: ['timestamp', 'sensorId', 'latitude', 'longitude', 'temperature', 'humidity', 'sensorStatus'] },
    custom: { label: 'Custom (pick fields)', fields: [] },
  };

  /* ---------- generation ---------- */
  function records(opts, r) {
    const L = DATA[opts.locale] || DATA.en;
    const out = [];
    const ADDR = new Set(['address', 'city', 'postalCode', 'country']);
    for (let i = 0; i < opts.count; i++) {
      const c = recordCtx(r, L, i, opts.locale);
      const rec = {};
      let addr = null;
      for (const f of opts.fields) {
        const def = FIELDS[f];
        if (!def) continue;
        const v = def.gen(c);
        if (opts.nested && ADDR.has(f)) {
          if (!addr) { addr = {}; rec.address = addr; }
          addr[f === 'address' ? 'street' : f] = v;
        } else rec[f] = v;
      }
      out.push(rec);
    }
    return out;
  }

  function txt(opts, r) {
    const L = DATA[opts.locale] || DATA.en;
    const lines = [];
    if (opts.txtMode === 'paragraphs') {
      for (let i = 0; i < opts.count; i++) lines.push(FIELDS.paragraph.gen(recordCtx(r, L, i, opts.locale)), '');
      return lines.join('\n').trimEnd() + '\n';
    }
    if (opts.txtMode === 'log') {
      let t = now.getTime() - opts.count * 1500;
      const levels = ['INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'DEBUG', 'DEBUG', 'WARN', 'WARN', 'ERROR'];
      for (let i = 0; i < opts.count; i++) {
        t += r.int(5, 3000);
        const lvl = r.pick(levels);
        const msg = r.pick(DATA.logMsgs[lvl]).replace(/\{(\w+)\}/g, (_, k) => ({
          user: 'u' + r.int(100, 999), ip: `10.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, ms: r.int(3, 4000),
          job: '#' + r.int(1000, 9999), n: r.int(1, 64), k: r.int(1, 5), pct: r.int(70, 99),
        }[k]));
        lines.push(`${new Date(t).toISOString()} ${lvl.padEnd(5)} [${r.pick(DATA.services)}] ${msg}`);
      }
      return lines.join('\n') + '\n';
    }
    // records: one human-readable line per record
    const recs = records(Object.assign({}, opts, { nested: false }), r);
    recs.forEach((o, i) => lines.push(`${i + 1}. ` + Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => `${k}: ${v}`).join(' | ')));
    return lines.join('\n') + '\n';
  }

  /** opts: {format, count, locale, fields, seed, nested, delimiter, txtMode} -> text */
  function generate(opts) {
    const r = makeRng(opts.seed);
    opts = Object.assign({ count: 25, locale: 'en', fields: PRESETS.people.fields, delimiter: ',', txtMode: 'records' }, opts);
    opts.count = Math.max(1, Math.min(100000, opts.count | 0));
    if (opts.format !== 'txt' && !opts.fields.length) throw new Error('Select at least one field.');
    switch (opts.format) {
      case 'json': return JSON.stringify(records(opts, r), null, 2) + '\n';
      case 'yaml':
        if (!CF.util.hasYaml()) throw new Error('YAML library not loaded.');
        return jsyaml.dump(records(opts, r), { lineWidth: -1, noRefs: true });
      case 'csv': {
        const recs = records(Object.assign({}, opts, { nested: false }), r);
        return CF.csv.stringify(CF.csv.fromObjects(recs), opts.delimiter, '\n', true);
      }
      case 'txt':
        if (!opts.fields.length) opts.fields = PRESETS.people.fields;
        return txt(opts, r);
      default:
        throw new Error('Synthetic generation is only available for JSON, YAML, CSV and TXT.');
    }
  }

  CF.synth = { FIELDS, PRESETS, generate, makeRng };
})();
