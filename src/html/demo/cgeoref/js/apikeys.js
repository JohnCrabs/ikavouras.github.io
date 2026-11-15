/* CGeoRef – Κλειδιά API παρόχων υποβάθρων (τοπική αποθήκευση στον browser) */
(function (GR) {
  'use strict';
  const STORE = 'cgeoref.apikeys';
  const REMEMBER = 'cgeoref.apikeys.remember';

  /** Πάροχοι που απαιτούν κλειδί. test: URL ενός πλακιδίου για έλεγχο του κλειδιού. */
  const PROVIDERS = [
    { id: 'maptiler', name: 'MapTiler', signup: 'https://cloud.maptiler.com/account/keys/',
      hint: 'Δωρεάν πλάνο: ~100k πλακίδια/μήνα', test: 'https://api.maptiler.com/maps/streets-v2/256/0/0/0.png?key={key}' },
    { id: 'thunderforest', name: 'Thunderforest', signup: 'https://manage.thunderforest.com/dashboard',
      hint: 'Δωρεάν «Hobby Project»: 150k πλακίδια/μήνα', test: 'https://tile.thunderforest.com/cycle/0/0/0.png?apikey={key}' },
    { id: 'stadia', name: 'Stadia Maps (Stamen)', signup: 'https://client.stadiamaps.com/dashboard/',
      hint: 'Σε localhost λειτουργεί και χωρίς κλειδί', test: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/0/0/0.png?api_key={key}' },
    { id: 'mapbox', name: 'Mapbox', signup: 'https://account.mapbox.com/access-tokens/',
      hint: 'Public access token (pk.…)', test: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/0/0/0?access_token={key}' },
    { id: 'here', name: 'HERE', signup: 'https://platform.here.com/admin/apps',
      hint: 'API key από το HERE Platform', test: 'https://maps.hereapi.com/v3/base/mc/0/0/0/png?style=explore.day&apiKey={key}' }
  ];

  let keys = {};
  let remember = localStorage.getItem(REMEMBER) !== '0';

  function load() {
    try {
      const src = remember ? localStorage.getItem(STORE) : sessionStorage.getItem(STORE);
      keys = JSON.parse(src || '{}') || {};
    } catch (e) { keys = {}; }
  }
  function persist() {
    const json = JSON.stringify(keys);
    if (remember) { localStorage.setItem(STORE, json); sessionStorage.removeItem(STORE); }
    else { sessionStorage.setItem(STORE, json); localStorage.removeItem(STORE); }
    localStorage.setItem(REMEMBER, remember ? '1' : '0');
  }

  const get = (id) => (keys[id] || '').trim();
  const has = (id) => !!get(id);
  function setAll(obj, rememberFlag) {
    keys = {};
    Object.keys(obj).forEach(k => { const v = String(obj[k] || '').trim(); if (v) keys[k] = v; });
    if (typeof rememberFlag === 'boolean') remember = rememberFlag;
    persist();
  }
  function clear() { keys = {}; localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); }

  /** Έλεγχος κλειδιού: φόρτωση ενός πλακιδίου ως εικόνα (αποφεύγει περιορισμούς CORS) */
  function test(id, key) {
    const p = PROVIDERS.find(x => x.id === id);
    return new Promise((resolve) => {
      if (!p || !key) return resolve(false);
      const img = new Image();
      const t = setTimeout(() => resolve(false), 10000);
      img.onload = () => { clearTimeout(t); resolve(true); };
      img.onerror = () => { clearTimeout(t); resolve(false); };
      img.src = p.test.replace('{key}', encodeURIComponent(key));
    });
  }

  load();
  GR.apikeys = { PROVIDERS, get, has, setAll, clear, test, get remember() { return remember; }, all: () => Object.assign({}, keys) };
})(window.GR = window.GR || {});
