/* CGeoRef – Κύρια λογική εφαρμογής (UI) */
(function (GR) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = GR.transforms, C = GR.crs;

  // ====================== Κατάσταση ======================
  const S = {
    img: null,            // { canvas, width, height, name, ext, url, data }
    gcps: [],             // { id, src:[x,y], dst:[X,Y], enabled }
    nextId: 1,
    tool: 'pan',
    transform: 'affine',
    lambda: 0,
    crs: 'EPSG:2100',
    fit: null,
    loo: null,
    selected: null,
    pending: null,        // { src } σημείο εικόνας σε αναμονή συντεταγμένων
    pendingDst: null,     // [lat,lng] όταν ο χρήστης κάνει πρώτα κλικ στον χάρτη
    overlay: null,
    link: false,
    exportGrid: null
  };

  // ====================== Βοηθητικά ======================
  function toast(msg, isErr, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.className = isErr ? 'err' : '';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms || (isErr ? 5000 : 2600));
  }
  function status(msg) { $('stMsg').textContent = msg || ''; }
  function progress(show, text, f) {
    $('progress').classList.toggle('hidden', !show);
    if (text) $('pgText').textContent = text;
    $('pgFill').style.width = ((f || 0) * 100).toFixed(1) + '%';
  }
  const isGeo = () => C.isGeographic(S.crs);
  const unit = () => (isGeo() ? '°' : (C.get(S.crs) && C.get(S.crs).units) || 'm');
  const fmtMap = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(isGeo() ? 7 : 3));
  const fmtRes = (v) => (v == null || !isFinite(v) ? '–' : (isGeo() ? v.toExponential(2) : v.toFixed(3)));
  const fmtPx = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(2));
  const baseName = () => (S.img ? S.img.name.replace(/\.[^.]+$/, '') : 'georef');

  /** Ανάλυση συντεταγμένης: δεκαδική (με , ή .) ή ΜΜΔ */
  function parseCoord(str) {
    if (str == null) return NaN;
    let s = String(str).trim();
    if (!s) return NaN;
    const neg = /^-|[SWΝΔ]\s*$/i.test(s);
    const nums = s.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g);
    if (!nums) return NaN;
    let v = parseFloat(nums[0]);
    if (nums.length > 1) v += parseFloat(nums[1]) / 60;
    if (nums.length > 2) v += parseFloat(nums[2]) / 3600;
    return neg ? -v : v;
  }

  // ====================== Χάρτες ======================
  const imgMap = L.map('imgMap', {
    crs: L.CRS.Simple, minZoom: -8, maxZoom: 6, zoomSnap: 0.25, zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90, attributionControl: false, doubleClickZoom: false
  }).setView([0, 0], 0);
  const toLL = (p) => L.latLng(-p[1], p[0]);
  const fromLL = (ll) => [ll.lng, -ll.lat];

  const refMap = L.map('refMap', { zoomSnap: 0.25, doubleClickZoom: false }).setView([38.3, 23.8], 7);
  L.control.scale({ imperial: false }).addTo(refMap);

  // Υπόβαθρα
  const baseLayers = {};   // id -> [στρώματα Leaflet] (cache)
  let currentBase = null;
  const selBase = $('selBasemap');
  const baseGroups = {};   // όνομα ομάδας -> <optgroup>
  function baseGroup(name) {
    if (!baseGroups[name]) {
      const g = document.createElement('optgroup');
      g.label = name;
      selBase.appendChild(g);
      baseGroups[name] = g;
    }
    return baseGroups[name];
  }
  function addBaseOption(id, name, group, layers) {
    if (layers) baseLayers[id] = layers;
    const o = document.createElement('option');
    o.value = id; o.textContent = name;
    baseGroup(group).appendChild(o);
  }
  GR.basemaps.GROUPS.forEach(baseGroup);
  GR.basemaps.LIST.forEach(b => addBaseOption(b.id, b.name, b.group));
  let currentBaseId = null;
  function refreshBaseLabels() {
    [...selBase.options].forEach(o => {
      const def = GR.basemaps.byId[o.value];
      if (!def) return;
      o.textContent = def.name + (GR.basemaps.missingKey(o.value) ? ' 🔒' : '');
    });
  }
  function setBase(id) {
    const miss = GR.basemaps.missingKey(id);
    if (miss) {
      selBase.value = currentBaseId || 'osm';
      toast('Το υπόβαθρο απαιτεί κλειδί API – συμπληρώστε το και επιλέξτε το ξανά');
      openKeys(miss, id);
      return;
    }
    currentBaseId = id;
    if (currentBase) currentBase.forEach(l => refMap.removeLayer(l));
    if (!baseLayers[id]) baseLayers[id] = GR.basemaps.build(id);
    const layers = baseLayers[id];
    if (!layers) return;
    // από το πάνω στρώμα προς το κάτω, ώστε οι επικαλύψεις να μένουν πάνω από το υπόβαθρο
    layers.slice().reverse().forEach(l => l.addTo(refMap).bringToBack());
    currentBase = layers;
    localStorage.setItem('cgeoref.base', id);
  }
  selBase.addEventListener('change', () => setBase(selBase.value));
  refreshBaseLabels();
  selBase.value = localStorage.getItem('cgeoref.base') || 'osm';
  if (!selBase.value || !GR.basemaps.byId[selBase.value] || GR.basemaps.missingKey(selBase.value)) selBase.value = 'osm';
  setBase(selBase.value);

  // ---- Κλειδιά API ----
  let keysPendingBase = null;
  function openKeys(focusId, pendingBase) {
    keysPendingBase = pendingBase || null;
    const box = $('keysList');
    box.innerHTML = '';
    GR.apikeys.PROVIDERS.forEach(p => {
      const row = document.createElement('div');
      row.className = 'key-row';
      row.innerHTML = `
        <div class="key-name"><b>${p.name}</b><br><a href="${p.signup}" target="_blank" rel="noopener">απόκτηση κλειδιού ↗</a></div>
        <div class="key-input">
          <input type="password" data-id="${p.id}" autocomplete="off" spellcheck="false" placeholder="${p.hint}">
          <button type="button" class="small key-show" title="Εμφάνιση / απόκρυψη">👁</button>
          <button type="button" class="small key-test" title="Δοκιμή κλειδιού">Δοκιμή</button>
          <span class="key-status"></span>
        </div>`;
      const inp = row.querySelector('input');
      inp.value = GR.apikeys.get(p.id);
      const stEl = row.querySelector('.key-status');
      stEl.textContent = inp.value ? '● αποθηκευμένο' : '';
      stEl.className = 'key-status' + (inp.value ? ' ok' : '');
      row.querySelector('.key-show').onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; };
      row.querySelector('.key-test').onclick = async () => {
        if (!inp.value.trim()) { stEl.textContent = 'κενό'; stEl.className = 'key-status bad'; return; }
        stEl.textContent = 'έλεγχος…'; stEl.className = 'key-status';
        const ok = await GR.apikeys.test(p.id, inp.value.trim());
        stEl.textContent = ok ? '✔ έγκυρο' : '✖ απορρίφθηκε';
        stEl.className = 'key-status ' + (ok ? 'ok' : 'bad');
      };
      if (p.id === focusId) row.classList.add('focus');
      box.appendChild(row);
    });
    $('keysRemember').checked = GR.apikeys.remember;
    $('dlgKeys').showModal();
    const f = box.querySelector('.focus input');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function collectKeys() {
    const o = {};
    $('keysList').querySelectorAll('input[data-id]').forEach(i => { o[i.dataset.id] = i.value; });
    return o;
  }
  function applyKeys() {
    // ξαναδημιουργία των στρωμάτων που χρησιμοποιούν κλειδί
    Object.keys(baseLayers).forEach(id => {
      const def = GR.basemaps.byId[id];
      if (def && (def.key || (def.combo && def.combo.some(c => GR.basemaps.byId[c].key)))) delete baseLayers[id];
    });
    refreshBaseLabels();
    const target = keysPendingBase && !GR.basemaps.missingKey(keysPendingBase) ? keysPendingBase : currentBaseId;
    keysPendingBase = null;
    if (target) { selBase.value = target; currentBaseId = null; setBase(target); }
  }
  $('btnKeys').addEventListener('click', () => openKeys());
  $('dlgKeys').addEventListener('close', () => {
    if ($('dlgKeys').returnValue !== 'ok') { keysPendingBase = null; return; }
    GR.apikeys.setAll(collectKeys(), $('keysRemember').checked);
    applyKeys();
    toast(GR.apikeys.remember ? 'Τα κλειδιά αποθηκεύτηκαν σε αυτόν τον browser' : 'Τα κλειδιά ισχύουν μέχρι να κλείσει η καρτέλα');
  });
  $('keysClear').addEventListener('click', () => {
    if (!confirm('Διαγραφή όλων των αποθηκευμένων κλειδιών API;')) return;
    GR.apikeys.clear();
    $('keysList').querySelectorAll('input[data-id]').forEach(i => { i.value = ''; });
    $('keysList').querySelectorAll('.key-status').forEach(s => { s.textContent = ''; s.className = 'key-status'; });
    applyKeys();
    toast('Τα κλειδιά διαγράφηκαν');
  });
  $('keysExport').addEventListener('click', () => {
    const k = collectKeys();
    Object.keys(k).forEach(x => { if (!k[x].trim()) delete k[x]; });
    if (!Object.keys(k).length) { toast('Δεν υπάρχουν κλειδιά για εξαγωγή', true); return; }
    GR.gcpio.download(JSON.stringify({ app: 'CGeoRef', type: 'apikeys', keys: k }, null, 2), 'cgeoref_apikeys.json', 'application/json');
  });
  $('keysImport').addEventListener('click', () => $('keysFile').click());
  $('keysFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const k = j.keys || j;
      let n = 0;
      $('keysList').querySelectorAll('input[data-id]').forEach(i => { if (typeof k[i.dataset.id] === 'string') { i.value = k[i.dataset.id]; n++; } });
      toast(n ? `Φορτώθηκαν ${n} κλειδιά – πατήστε «Αποθήκευση»` : 'Δεν βρέθηκαν κλειδιά στο αρχείο', !n);
    } catch (err) { toast('Μη έγκυρο αρχείο κλειδιών', true); }
  });

  // Στρώματα
  const imgGcpLayer = L.layerGroup().addTo(imgMap);
  const imgResLayer = L.layerGroup().addTo(imgMap);
  const mapGcpLayer = L.layerGroup().addTo(refMap);
  const mapResLayer = L.layerGroup().addTo(refMap);
  let imgOverlay = null;
  const imgMarkers = new Map(), mapMarkers = new Map();
  let pendingImgMarker = null, pendingMapMarker = null;
  const predMapMarker = L.circleMarker([0, 0], { radius: 9, color: '#20c997', weight: 2, fillOpacity: 0.15, interactive: false });
  const predImgMarker = L.circleMarker([0, 0], { radius: 9, color: '#20c997', weight: 2, fillOpacity: 0.15, interactive: false });

  function icon(id, cls) {
    return L.divIcon({ className: 'gcp-icon ' + (cls || ''), html: `<div class="cross"></div><div class="lbl">${id}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  // ====================== Φόρτωση εικόνας ======================
  async function openImageFile(file) {
    let opts = {};
    if (/\.pdf$/i.test(file.name)) {
      const dlg = $('dlgPdf');
      dlg.showModal();
      const rv = await new Promise(r => dlg.addEventListener('close', () => r(dlg.returnValue), { once: true }));
      if (rv !== 'ok') return;
      opts = { page: +$('pdfPage').value, dpi: +$('pdfDpi').value };
    }
    progress(true, 'Φόρτωση ' + file.name + '…', 0.3);
    try {
      const im = await GR.imageLoader.load(file, opts);
      await setImage(im);
    } catch (e) {
      console.error(e);
      toast('Σφάλμα φόρτωσης: ' + e.message, true);
    } finally { progress(false); }
  }

  async function setImage(im) {
    const blob = await new Promise(r => im.canvas.toBlob(r, 'image/png'));
    if (S.img && S.img.url) URL.revokeObjectURL(S.img.url);
    im.url = URL.createObjectURL(blob);
    im.data = null;
    const hadGcps = S.gcps.length > 0;
    S.img = im;
    if (imgOverlay) imgMap.removeLayer(imgOverlay);
    const b = [[-im.height, 0], [0, im.width]];
    imgOverlay = L.imageOverlay(im.url, b).addTo(imgMap);
    imgMap.setMaxBounds(L.latLngBounds(b).pad(1.5));
    imgMap.fitBounds(b);
    $('dropHint').classList.add('hidden');
    $('imgInfo').textContent = `${im.name} — ${im.width} × ${im.height} px`;
    removeOverlay();
    // Επαναφορά αποθηκευμένης συνεδρίας για την ίδια εικόνα
    const saved = loadSession();
    if (!hadGcps && saved && saved.imageName === im.name && saved.gcps && saved.gcps.length) {
      if (confirm(`Βρέθηκαν ${saved.gcps.length} αποθηκευμένα σημεία ελέγχου για την εικόνα «${im.name}». Επαναφορά;`)) {
        applyProject(saved);
      }
    }
    refreshAll();
    toast('Φορτώθηκε: ' + im.name);
  }

  function getImageData() {
    if (!S.img.data) S.img.data = S.img.canvas.getContext('2d').getImageData(0, 0, S.img.width, S.img.height).data;
    return S.img.data;
  }

  // ====================== Σημεία ελέγχου ======================
  function addGcp(src, dst, id) {
    const g = { id: id || S.nextId, src: src.slice(), dst: dst.slice(), enabled: true };
    S.nextId = Math.max(S.nextId, g.id) + 1;
    S.gcps.push(g);
    S.selected = g.id;
    refreshAll();
    return g;
  }
  function deleteGcp(id) {
    S.gcps = S.gcps.filter(g => g.id !== id);
    if (S.selected === id) S.selected = null;
    refreshAll();
  }
  const gcpById = (id) => S.gcps.find(g => g.id === id);

  function recompute() {
    S.fit = null; S.loo = null;
    if (!S.gcps.length) return;
    const opts = { lambda: S.lambda };
    S.fit = T.fit(S.transform, S.gcps, opts);
    if (S.fit.ok) S.loo = T.crossValidate(S.transform, S.gcps, opts);
  }

  function refreshAll() {
    recompute();
    renderMarkers();
    renderResiduals();
    renderTable();
    renderStats();
    saveSession();
  }

  function renderMarkers() {
    imgGcpLayer.clearLayers(); mapGcpLayer.clearLayers();
    imgMarkers.clear(); mapMarkers.clear();
    const drag = S.tool === 'move';
    const showOnMap = !S.overlay || $('ovShowGcp').checked;
    S.gcps.forEach(g => {
      const cls = (g.enabled ? '' : 'off ') + (g.id === S.selected ? 'sel' : '');
      const mi = L.marker(toLL(g.src), { icon: icon(g.id, cls), draggable: drag, autoPan: true }).addTo(imgGcpLayer);
      mi.on('click', () => onMarkerClick(g.id));
      mi.on('dragend', (e) => { g.src = fromLL(e.target.getLatLng()); refreshAll(); });
      imgMarkers.set(g.id, mi);
      if (showOnMap) {
        let ll;
        try { ll = C.toLatLng(S.crs, g.dst); } catch (e) { ll = null; }
        if (ll && isFinite(ll[0]) && isFinite(ll[1])) {
          const mm = L.marker(ll, { icon: icon(g.id, cls), draggable: drag, autoPan: true }).addTo(mapGcpLayer);
          mm.on('click', () => onMarkerClick(g.id));
          mm.on('dragend', (e) => { g.dst = C.fromLatLng(S.crs, e.target.getLatLng()); refreshAll(); });
          mapMarkers.set(g.id, mm);
        }
      }
    });
  }

  function onMarkerClick(id) {
    if (S.tool === 'delete') { deleteGcp(id); return; }
    selectGcp(id, false);
  }

  function selectGcp(id, pan) {
    S.selected = id;
    renderMarkers();
    document.querySelectorAll('#gcpTable tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.id === id));
    if (pan) {
      const g = gcpById(id);
      if (!g) return;
      imgMap.panTo(toLL(g.src));
      const mm = mapMarkers.get(id);
      if (mm) refMap.panTo(mm.getLatLng());
    }
  }

  function renderResiduals() {
    imgResLayer.clearLayers(); mapResLayer.clearLayers();
    if (!S.fit || !S.fit.ok) return;
    const k = +$('resScale').value || 0;
    if (!k) return;
    S.gcps.forEach((g, i) => {
      const r = S.fit.res[i];
      if (!isFinite(r.dx) || !isFinite(r.dy)) return;
      const col = g.enabled ? '#e03131' : '#868e96';
      L.polyline([toLL(g.src), toLL([g.src[0] + r.dx * k, g.src[1] + r.dy * k])], { color: col, weight: 2, interactive: false }).addTo(imgResLayer);
      try {
        const a = C.toLatLng(S.crs, g.dst), b = C.toLatLng(S.crs, [g.dst[0] + r.dX * k, g.dst[1] + r.dY * k]);
        L.polyline([a, b], { color: col, weight: 2, interactive: false }).addTo(mapResLayer);
      } catch (e) { /* αγνόησε */ }
    });
  }

  function renderTable() {
    const tb = document.querySelector('#gcpTable tbody');
    tb.innerHTML = '';
    $('gcpEmpty').classList.toggle('hidden', S.gcps.length > 0);
    document.querySelectorAll('#gcpTable .unit').forEach(e => (e.textContent = unit()));
    const fitOk = S.fit && S.fit.ok;
    const rmse = fitOk ? S.fit.stats.rmseMap : 0;
    const minOut = T.byId[S.transform].minPts + 2;
    S.gcps.forEach((g, i) => {
      const r = fitOk ? S.fit.res[i] : null;
      const loo = S.loo ? S.loo.perPoint[i] : null;
      const tr = document.createElement('tr');
      tr.dataset.id = g.id;
      const outlier = r && g.enabled && S.fit.stats.n >= minOut && rmse > 0 && r.dMap > 2.5 * rmse;
      tr.className = (g.enabled ? '' : 'off ') + (g.id === S.selected ? 'sel ' : '') + (outlier ? 'outlier' : '');
      tr.innerHTML = `
        <td><input type="checkbox" class="en" ${g.enabled ? 'checked' : ''}></td>
        <td>${g.id}</td>
        <td><input class="cell" data-k="sx" value="${g.src[0].toFixed(2)}"></td>
        <td><input class="cell" data-k="sy" value="${g.src[1].toFixed(2)}"></td>
        <td><input class="cell" data-k="dx" value="${fmtMap(g.dst[0])}"></td>
        <td><input class="cell" data-k="dy" value="${fmtMap(g.dst[1])}"></td>
        <td>${r ? fmtPx(r.dx) : '–'}</td>
        <td>${r ? fmtPx(r.dy) : '–'}</td>
        <td class="res">${r ? fmtPx(r.dPx) : '–'}</td>
        <td class="res">${r ? fmtRes(r.dMap) : '–'}</td>
        <td>${loo != null ? fmtRes(loo) : '–'}</td>
        <td><button class="del" title="Διαγραφή">✖</button></td>`;
      if (outlier) tr.title = 'Πιθανό χονδροειδές σφάλμα (υπόλοιπο > 2.5 × RMSE)';
      tr.querySelector('.en').addEventListener('change', (e) => { g.enabled = e.target.checked; refreshAll(); });
      tr.querySelector('.del').addEventListener('click', (e) => { e.stopPropagation(); deleteGcp(g.id); });
      tr.querySelectorAll('input.cell').forEach(inp => {
        inp.addEventListener('change', () => {
          const v = parseCoord(inp.value);
          if (!isFinite(v)) { toast('Μη έγκυρη τιμή', true); renderTable(); return; }
          const k = inp.dataset.k;
          if (k === 'sx') g.src[0] = v; else if (k === 'sy') g.src[1] = v;
          else if (k === 'dx') g.dst[0] = v; else g.dst[1] = v;
          refreshAll();
        });
        inp.addEventListener('focus', () => selectGcp(g.id, false));
      });
      tr.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') selectGcp(g.id, true); });
      tb.appendChild(tr);
    });
  }

  function renderStats() {
    const el = $('stats');
    const Tdef = T.byId[S.transform];
    const nAct = S.gcps.filter(g => g.enabled).length;
    if (!S.gcps.length) { el.innerHTML = `<span class="muted">Ελάχιστα σημεία: ${Tdef.minPts}</span>`; return; }
    if (!S.fit || !S.fit.ok) { el.innerHTML = `<span class="err">${S.fit ? S.fit.error : ''}</span>`; return; }
    const st = S.fit.stats, u = unit();
    const geo = T.localGeometry(S.fit.model, S.img ? [S.img.width / 2, S.img.height / 2] : S.gcps[0].src);
    let h = `<span>GCP: <b>${nAct}</b>/${S.gcps.length}</span>`;
    h += `<span>RMSE: <b>${fmtPx(st.rmsePx)}</b> px · <b>${fmtRes(st.rmseMap)}</b> ${u}</span>`;
    if (st.sigma0 != null) h += `<span title="Τυπικό σφάλμα βάρους μονάδας (βαθμοί ελευθερίας ${st.dof})">σ₀: <b>${fmtRes(st.sigma0)}</b></span>`;
    if (S.loo) h += `<span title="Σφάλμα πρόβλεψης διασταυρωμένης επικύρωσης">LOO RMSE: <b>${fmtRes(S.loo.rmse)}</b> ${u}</span>`;
    h += `<span title="Μέγεθος pixel στο κέντρο της εικόνας">Pixel ≈ <b>${fmtRes((geo.sx + geo.sy) / 2)}</b> ${u}</span>`;
    h += `<span title="Γωνία στροφής">Στροφή: <b>${geo.rot.toFixed(3)}°</b></span>`;
    el.innerHTML = h;
  }

  // ====================== Εργαλεία ======================
  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('#toolGroup button').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    $('imgMap').classList.toggle('tool-add', t === 'add');
    $('imgMap').classList.toggle('tool-delete', t === 'delete');
    $('refMap').classList.toggle('picking', t === 'add' || !!S.pending);
    if (t !== 'add') cancelPending();
    renderMarkers();
    status({ pan: 'Μετακίνηση προβολής', add: 'Κλικ στην εικόνα για νέο σημείο ελέγχου (ή πρώτα στον χάρτη)', move: 'Σύρετε τα σημεία στην εικόνα ή στον χάρτη', delete: 'Κλικ σε σημείο για διαγραφή' }[t]);
  }
  document.querySelectorAll('#toolGroup button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

  // --- Κλικ στην εικόνα ---
  imgMap.on('click', (e) => {
    if (S.tool !== 'add' || !S.img) return;
    const src = fromLL(e.latlng);
    if (src[0] < 0 || src[1] < 0 || src[0] > S.img.width || src[1] > S.img.height) { toast('Το σημείο είναι εκτός εικόνας', true); return; }
    beginPending(src);
  });

  function beginPending(src) {
    S.pending = { src };
    if (pendingImgMarker) imgMap.removeLayer(pendingImgMarker);
    pendingImgMarker = L.marker(toLL(src), { icon: icon(S.nextId, 'pending'), interactive: false }).addTo(imgMap);
    openPointDialog();
  }

  function cancelPending() {
    S.pending = null; S.pendingDst = null;
    if (pendingImgMarker) { imgMap.removeLayer(pendingImgMarker); pendingImgMarker = null; }
    if (pendingMapMarker) { refMap.removeLayer(pendingMapMarker); pendingMapMarker = null; }
    $('dlgPoint').classList.add('hidden');
    $('pickHint').classList.add('hidden');
    $('refMap').classList.toggle('picking', S.tool === 'add');
  }

  // --- Παράθυρο συντεταγμένων ---
  function fillDpCrs() {
    const sel = $('dpCrs');
    const prev = sel.value;
    sel.innerHTML = '';
    const opts = [S.crs].concat(C.list().map(c => c.code).filter(c => c !== S.crs));
    opts.forEach(code => {
      const c = C.get(code);
      const o = document.createElement('option');
      o.value = code; o.textContent = `${code} – ${c ? c.name : ''}` + (code === S.crs ? ' (προορισμού)' : '');
      sel.appendChild(o);
    });
    sel.value = opts.includes(prev) ? prev : S.crs;
    updateDpLabels();
  }
  function updateDpLabels() {
    const g = C.isGeographic($('dpCrs').value);
    $('dpLx').textContent = g ? 'Γεωγρ. μήκος λ (°)' : 'X / Ανατολικές';
    $('dpLy').textContent = g ? 'Γεωγρ. πλάτος φ (°)' : 'Y / Βόρειες';
  }
  function setDpFromTarget(p) {
    const code = $('dpCrs').value;
    const q = C.transform(S.crs, code, p);
    const d = C.isGeographic(code) ? 8 : 3;
    $('dpX').value = q[0].toFixed(d); $('dpY').value = q[1].toFixed(d);
  }
  function setDpFromLatLng(ll) {
    const code = $('dpCrs').value;
    const q = C.fromLatLng(code, ll);
    const d = C.isGeographic(code) ? 8 : 3;
    $('dpX').value = q[0].toFixed(d); $('dpY').value = q[1].toFixed(d);
  }
  $('dpCrs').addEventListener('change', () => {
    // μετατροπή υπαρχουσών τιμών στο νέο σύστημα
    const from = $('dpCrs').dataset.prev || S.crs;
    const x = parseCoord($('dpX').value), y = parseCoord($('dpY').value);
    updateDpLabels();
    if (isFinite(x) && isFinite(y)) {
      const q = C.transform(from, $('dpCrs').value, [x, y]);
      const d = C.isGeographic($('dpCrs').value) ? 8 : 3;
      $('dpX').value = q[0].toFixed(d); $('dpY').value = q[1].toFixed(d);
    }
    $('dpCrs').dataset.prev = $('dpCrs').value;
  });

  function openPointDialog() {
    fillDpCrs();
    $('dpCrs').dataset.prev = $('dpCrs').value;
    $('dpId').textContent = '#' + S.nextId;
    $('dpX').value = ''; $('dpY').value = '';
    if (S.pendingDst) setDpFromLatLng(S.pendingDst);
    else if (S.fit && S.fit.ok) {
      try {
        const p = S.fit.model.forward(S.pending.src);
        setDpFromTarget(p);
        showPendingMap(C.toLatLng(S.crs, p));
      } catch (e) { /* χωρίς πρόβλεψη */ }
    }
    $('dlgPoint').classList.remove('hidden');
    $('pickHint').classList.remove('hidden');
    $('refMap').classList.add('picking');
    setTimeout(() => $('dpX').focus(), 30);
  }
  function showPendingMap(ll) {
    if (pendingMapMarker) refMap.removeLayer(pendingMapMarker);
    pendingMapMarker = L.marker(ll, { icon: icon(S.nextId, 'pending'), interactive: false }).addTo(refMap);
  }

  function confirmPoint() {
    if (!S.pending) return;
    const x = parseCoord($('dpX').value), y = parseCoord($('dpY').value);
    if (!isFinite(x) || !isFinite(y)) { toast('Συμπληρώστε έγκυρες συντεταγμένες', true); return; }
    let dst;
    try { dst = C.transform($('dpCrs').value, S.crs, [x, y]); }
    catch (e) { toast('Σφάλμα μετατροπής: ' + e.message, true); return; }
    const src = S.pending.src;
    cancelPending();
    addGcp(src, dst);
    toast(`Προστέθηκε σημείο #${S.gcps[S.gcps.length - 1].id}`);
  }
  $('dpOk').addEventListener('click', confirmPoint);
  $('dpCancel').addEventListener('click', cancelPending);
  ['dpX', 'dpY'].forEach(id => $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmPoint();
    if (e.key === 'Escape') cancelPending();
  }));
  makeDraggable($('dlgPoint'), $('dlgPoint').querySelector('.fl-head'));

  // --- Κλικ στον χάρτη αναφοράς ---
  refMap.on('click', (e) => {
    if (S.pending) {
      setDpFromLatLng(e.latlng);
      showPendingMap(e.latlng);
      return;
    }
    if (S.tool === 'add') {
      S.pendingDst = e.latlng;
      showPendingMap(e.latlng);
      status('Σημείο χάρτη επιλέχθηκε – κάντε τώρα κλικ στο αντίστοιχο σημείο της εικόνας');
    }
  });

  // --- Ζωντανή πρόβλεψη / συντεταγμένες ---
  imgMap.on('mousemove', (e) => {
    const p = fromLL(e.latlng);
    $('stImg').textContent = `Εικόνα: ${p[0].toFixed(1)}, ${p[1].toFixed(1)} px`;
    if (S.fit && S.fit.ok) {
      try {
        const q = S.fit.model.forward(p);
        $('stPred').textContent = `Πρόβλεψη: ${fmtMap(q[0])}, ${fmtMap(q[1])} ${unit()}`;
        predMapMarker.setLatLng(C.toLatLng(S.crs, q));
        if (!refMap.hasLayer(predMapMarker)) predMapMarker.addTo(refMap);
      } catch (err) { /* */ }
    }
  });
  imgMap.on('mouseout', () => { if (refMap.hasLayer(predMapMarker)) refMap.removeLayer(predMapMarker); });
  refMap.on('mousemove', (e) => {
    let q;
    try { q = C.fromLatLng(S.crs, e.latlng); } catch (err) { return; }
    $('stMap').textContent = `Χάρτης (${S.crs}): ${fmtMap(q[0])}, ${fmtMap(q[1])} · φ ${e.latlng.lat.toFixed(6)} λ ${e.latlng.lng.toFixed(6)}`;
    if (S.fit && S.fit.ok && S.img) {
      try {
        const p = S.fit.model.inverse(q);
        $('stPred').textContent = `Πρόβλεψη: ${p[0].toFixed(1)}, ${p[1].toFixed(1)} px`;
        predImgMarker.setLatLng(toLL(p));
        if (!imgMap.hasLayer(predImgMarker)) predImgMarker.addTo(imgMap);
      } catch (err) { /* */ }
    }
  });
  refMap.on('mouseout', () => { if (imgMap.hasLayer(predImgMarker)) imgMap.removeLayer(predImgMarker); });

  // --- Σύνδεση προβολών ---
  let syncing = false;
  const metersPerUnit = (lat) => (isGeo() ? 111320 * Math.cos(lat * Math.PI / 180) : 1);
  function syncImgToMap() {
    if (!S.link || syncing || !S.fit || !S.fit.ok || !S.img) return;
    try {
      const c = fromLL(imgMap.getCenter());
      const q = S.fit.model.forward(c);
      const ll = C.toLatLng(S.crs, q);
      const g = T.localGeometry(S.fit.model, c);
      const mPerImgPx = ((g.sx + g.sy) / 2) * metersPerUnit(ll[0]);
      const mPerScreen = mPerImgPx / Math.pow(2, imgMap.getZoom());
      const z = Math.log2(156543.03392 * Math.cos(ll[0] * Math.PI / 180) / mPerScreen);
      syncing = true;
      refMap.setView(ll, Math.max(0, Math.min(22, z)), { animate: false });
      setTimeout(() => (syncing = false), 50);
    } catch (e) { syncing = false; }
  }
  function syncMapToImg() {
    if (!S.link || syncing || !S.fit || !S.fit.ok || !S.img) return;
    try {
      const ll = refMap.getCenter();
      const p = S.fit.model.inverse(C.fromLatLng(S.crs, ll));
      const g = T.localGeometry(S.fit.model, p);
      const mPerImgPx = ((g.sx + g.sy) / 2) * metersPerUnit(ll.lat);
      const mPerScreen = 156543.03392 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, refMap.getZoom());
      const z = Math.log2(mPerImgPx / mPerScreen);
      syncing = true;
      imgMap.setView(toLL(p), Math.max(-8, Math.min(6, z)), { animate: false });
      setTimeout(() => (syncing = false), 50);
    } catch (e) { syncing = false; }
  }
  imgMap.on('moveend', syncImgToMap);
  refMap.on('moveend', syncMapToImg);
  $('chkLink').addEventListener('change', (e) => {
    S.link = e.target.checked;
    if (S.link && !(S.fit && S.fit.ok)) toast('Η σύνδεση ενεργοποιείται όταν υπάρχει έγκυρος μετασχηματισμός');
    syncImgToMap();
  });

  // ====================== Ρυθμίσεις μετασχηματισμού / CRS ======================
  const selT = $('selTransform');
  T.LIST.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = `${t.name} (≥${t.minPts})`;
    o.title = t.desc;
    selT.appendChild(o);
  });
  selT.value = S.transform;
  selT.addEventListener('change', () => {
    S.transform = selT.value;
    $('lambdaWrap').classList.toggle('hidden', !T.byId[S.transform].smoothing);
    refreshAll();
  });
  $('inpLambda').addEventListener('change', () => { S.lambda = Math.max(0, +$('inpLambda').value || 0); refreshAll(); });
  $('resScale').addEventListener('change', renderResiduals);

  function fillCrsSelect() {
    const sel = $('selCrs');
    sel.innerHTML = '';
    C.list().forEach(c => {
      const o = document.createElement('option');
      o.value = c.code; o.textContent = `${c.code} – ${c.name}`;
      sel.appendChild(o);
    });
    sel.value = S.crs;
  }
  $('selCrs').addEventListener('change', () => setCrs($('selCrs').value, true));

  function setCrs(code, ask) {
    const old = S.crs;
    if (code === old) return;
    if (ask && S.gcps.length && confirm(`Μετασχηματισμός των συντεταγμένων των GCP από ${old} σε ${code};\n(Άκυρο = διατήρηση αριθμητικών τιμών)`)) {
      try { S.gcps.forEach(g => { g.dst = C.transform(old, code, g.dst); }); }
      catch (e) { toast('Σφάλμα μετατροπής: ' + e.message, true); }
    }
    S.crs = code;
    $('selCrs').value = code;
    removeOverlay();
    refreshAll();
  }

  $('btnAddCrs').addEventListener('click', () => { $('crsInput').value = ''; $('crsName').value = ''; $('dlgCrs').showModal(); });
  $('dlgCrs').addEventListener('close', async () => {
    if ($('dlgCrs').returnValue !== 'ok') return;
    const v = $('crsInput').value.trim();
    if (!v) return;
    try {
      progress(true, 'Ανάκτηση ορισμού CRS…', 0.5);
      const c = await C.add(v, $('crsName').value.trim() || null);
      fillCrsSelect();
      setCrs(c.code, true);
      toast('Προστέθηκε ' + c.code + ' – ' + c.name);
    } catch (e) { toast('Αποτυχία προσθήκης CRS: ' + e.message, true); }
    finally { progress(false); }
  });

  // Προσαρμοσμένο υπόβαθρο
  $('btnCustomBase').addEventListener('click', () => $('dlgBase').showModal());
  $('cbType').addEventListener('change', () => $('cbLayersWrap').classList.toggle('hidden', $('cbType').value !== 'wms'));
  $('cbLayersWrap').classList.add('hidden');
  $('dlgBase').addEventListener('close', () => {
    if ($('dlgBase').returnValue !== 'ok') return;
    const url = $('cbUrl').value.trim();
    if (!url) return;
    const id = 'custom' + Date.now();
    const name = $('cbName').value.trim() || 'Προσαρμοσμένο';
    addBaseOption(id, name, 'Προσαρμοσμένα', [GR.basemaps.custom($('cbType').value, url, $('cbLayers').value.trim(), name)]);
    selBase.value = id;
    if (currentBase) currentBase.forEach(l => refMap.removeLayer(l));
    baseLayers[id][0].addTo(refMap).bringToBack();
    currentBase = baseLayers[id];
    currentBaseId = id;
  });

  // ====================== Επικάλυψη αποτελέσματος (online έλεγχος) ======================
  async function buildOverlay(maxSize) {
    if (!S.img) throw new Error('Δεν έχει φορτωθεί εικόνα');
    if (!S.fit || !S.fit.ok) throw new Error(S.fit ? S.fit.error : 'Δεν υπάρχουν σημεία ελέγχου');
    const model = S.fit.model;
    const toM = (p) => C.transform(S.crs, 'EPSG:3857', p);
    const fromM = (p) => C.transform('EPSG:3857', S.crs, p);
    const bb = GR.warp.bbox(GR.warp.borderPoints(S.img.width, S.img.height).map(p => toM(model.forward(p))));
    if (!isFinite(bb.minX)) throw new Error('Μη έγκυρη έκταση αποτελέσματος');
    const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
    const longest = Math.min(maxSize, Math.max(S.img.width, S.img.height) * 1.2);
    const sc = longest / Math.max(bw, bh);
    const outW = Math.max(1, Math.round(bw * sc)), outH = Math.max(1, Math.round(bh * sc));
    const rx = bw / outW, ry = bh / outH;
    progress(true, 'Δημιουργία προεπισκόπησης…', 0);
    const res = await GR.warp.warp({
      src: getImageData(), srcW: S.img.width, srcH: S.img.height, outW, outH,
      method: 'bilinear', step: 8,
      mapFn: (ox, oy) => model.inverse(fromM([bb.minX + ox * rx, bb.maxY - oy * ry])),
      onProgress: (f) => progress(true, null, f)
    });
    const cv = document.createElement('canvas');
    cv.width = outW; cv.height = outH;
    cv.getContext('2d').putImageData(new ImageData(res.data, outW, outH), 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const sw = C.transform('EPSG:3857', 'EPSG:4326', [bb.minX, bb.minY]);
    const ne = C.transform('EPSG:3857', 'EPSG:4326', [bb.maxX, bb.maxY]);
    return { url: URL.createObjectURL(blob), bounds: L.latLngBounds([sw[1], sw[0]], [ne[1], ne[0]]) };
  }

  async function showOverlay(fit) {
    try {
      const o = await buildOverlay(2048);
      removeOverlay();
      const layer = L.imageOverlay(o.url, o.bounds, { opacity: +$('ovOpacity').value, interactive: false, className: 'georef-overlay' }).addTo(refMap);
      S.overlay = { layer, url: o.url, bounds: o.bounds };
      mapGcpLayer.bringToFront && mapGcpLayer.eachLayer(l => l.setZIndexOffset && l.setZIndexOffset(1000));
      $('overlayCtl').classList.remove('hidden');
      if (fit !== false) refMap.fitBounds(o.bounds, { padding: [20, 20] });
      applySwipe();
      renderMarkers();
      toast('Η γεωαναφερμένη εικόνα φορτώθηκε στον χάρτη');
    } catch (e) {
      console.error(e);
      toast(e.message, true);
    } finally { progress(false); }
  }

  function removeOverlay() {
    if (!S.overlay) return;
    refMap.removeLayer(S.overlay.layer);
    URL.revokeObjectURL(S.overlay.url);
    S.overlay = null;
    $('overlayCtl').classList.add('hidden');
    $('ovBlink').checked = false; stopBlink();
    swipeLine.style.display = 'none';
    renderMarkers();
  }

  // Swipe
  const swipeLine = document.createElement('div');
  swipeLine.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#ff8c42;z-index:650;pointer-events:none;display:none;box-shadow:0 0 3px #000';
  $('refMap').appendChild(swipeLine);
  function applySwipe() {
    if (!S.overlay) return;
    const el = S.overlay.layer.getElement();
    if (!el) return;
    const v = +$('ovSwipe').value;
    if (v >= 100) { el.style.clipPath = ''; swipeLine.style.display = 'none'; return; }
    const mr = $('refMap').getBoundingClientRect(), er = el.getBoundingClientRect();
    const x = mr.left + mr.width * v / 100;
    const ratio = Math.max(0, Math.min(1, (x - er.left) / er.width));
    el.style.clipPath = `inset(0 ${(1 - ratio) * 100}% 0 0)`;
    swipeLine.style.display = 'block';
    swipeLine.style.left = (mr.width * v / 100) + 'px';
  }
  refMap.on('move zoom zoomend viewreset resize', applySwipe);
  $('ovSwipe').addEventListener('input', applySwipe);
  $('ovOpacity').addEventListener('input', () => { if (S.overlay) S.overlay.layer.setOpacity(+$('ovOpacity').value); });
  let blinkT = null;
  function stopBlink() { clearInterval(blinkT); blinkT = null; if (S.overlay) S.overlay.layer.setOpacity(+$('ovOpacity').value); }
  $('ovBlink').addEventListener('change', (e) => {
    if (!e.target.checked) { stopBlink(); return; }
    let on = true;
    blinkT = setInterval(() => { on = !on; if (S.overlay) S.overlay.layer.setOpacity(on ? +$('ovOpacity').value : 0); }, 600);
  });
  $('ovShowGcp').addEventListener('change', renderMarkers);
  $('ovZoom').addEventListener('click', () => S.overlay && refMap.fitBounds(S.overlay.bounds));
  $('btnOverlayClose').addEventListener('click', removeOverlay);
  $('btnPreview').addEventListener('click', () => showOverlay(true));

  // ====================== Γεωαναφορά & εξαγωγή ======================
  $('btnExport').addEventListener('click', () => {
    if (!S.img) { toast('Φορτώστε πρώτα μια εικόνα', true); return; }
    if (!S.fit || !S.fit.ok) { toast(S.fit ? S.fit.error : 'Δεν υπάρχουν σημεία ελέγχου', true); return; }
    const g = GR.warp.autoGrid(S.fit.model, S.img.width, S.img.height);
    S.exportGrid = g;
    $('exTransform').value = T.byId[S.transform].name + (T.byId[S.transform].smoothing && S.lambda ? ` (λ=${S.lambda})` : '');
    $('exCrs').value = S.crs + ' – ' + (C.get(S.crs) ? C.get(S.crs).name : '');
    const r = Number(g.res.toPrecision(6));
    $('exResX').value = r; $('exResY').value = r;
    $('exName').value = baseName() + '_georef';
    try {
      const a = affineFor();
      $('exOrigPng').checked = !['png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'bmp', 'webp'].includes(S.img.ext);
    $('exAffNote').textContent = a.approx
        ? `Ο ${T.byId[S.transform].name} δεν περιγράφεται με 6 παραμέτρους: για την αρχική εικόνα θα χρησιμοποιηθεί η βέλτιστη αφινική προσέγγιση από τα ίδια GCP (RMSE ${fmtRes(a.rmse)} ${unit()}).`
        : 'Ακριβής αποθήκευση: ο μετασχηματισμός είναι αφινικός. Το CTopoSim συγκρίνει τότε τις γωνίες της εικόνας.';
    } catch (e) { $('exAffNote').textContent = e.message; }
    updateExportDims();
    $('dlgExport').showModal();
  });
  function exportDims() {
    const g = S.exportGrid, rx = +$('exResX').value, ry = +$('exResY').value;
    if (!g || !(rx > 0) || !(ry > 0)) return null;
    return { w: Math.ceil((g.bbox.maxX - g.bbox.minX) / rx), h: Math.ceil((g.bbox.maxY - g.bbox.minY) / ry), rx, ry };
  }
  function updateExportDims() {
    const d = exportDims();
    $('exDims').textContent = d ? `Διαστάσεις εξόδου: ${d.w} × ${d.h} px (${(d.w * d.h / 1e6).toFixed(1)} MP) · Έκταση X: ${fmtMap(S.exportGrid.bbox.minX)} – ${fmtMap(S.exportGrid.bbox.maxX)}, Y: ${fmtMap(S.exportGrid.bbox.minY)} – ${fmtMap(S.exportGrid.bbox.maxY)}` : '';
  }
  ['exResX', 'exResY'].forEach(id => $(id).addEventListener('input', updateExportDims));

  $('dlgExport').addEventListener('close', () => { if ($('dlgExport').returnValue === 'ok') runExport(); });

  // ---------- Αρχική εικόνα χωρίς επαναδειγματοληψία (GeoTIFF / world file) ----------
  const AFFINE_IDS = ['linear', 'helmert', 'affine'];
  /** Αφινικό μοντέλο για την αρχική εικόνα: ο ίδιος ο μετασχηματισμός ή η αφινική προσέγγισή του */
  function affineFor() {
    if (AFFINE_IDS.includes(S.transform)) return { model: S.fit.model, approx: false };
    const r = T.fit('affine', S.gcps, {});
    if (!r.ok) throw new Error('Αφινική προσέγγιση: ' + r.error);
    return { model: r.model, approx: true, rmse: r.stats.rmseMap };
  }
  function checkReady() {
    if (!S.img) { toast('Φορτώστε πρώτα μια εικόνα', true); return false; }
    if (!S.fit || !S.fit.ok) { toast(S.fit ? S.fit.error : 'Δεν υπάρχουν σημεία ελέγχου', true); return false; }
    return true;
  }
  /** Επέκταση world file: .pgw/.jgw/.tfw κατά τον τύπο εικόνας (PDF → PNG αντίγραφο), ή .pgw/.wld */
  function worldExt(choice) {
    if (choice && choice !== 'auto') return choice;
    return { png: 'pgw', jpg: 'jgw', jpeg: 'jgw', tif: 'tfw', tiff: 'tfw', gif: 'gfw', bmp: 'bpw', webp: 'wld' }[S.img.ext] || 'pgw';
  }
  const fmtW = (v) => v.toFixed(10);

  async function saveOriginalGeoTiff(quiet) {
    const a = affineFor(), m = a.model;
    // συντελεστές για τη γωνία του pixel (0,0) – GeoTIFF PixelIsArea
    const o = m.forward([0, 0]), x1 = m.forward([1, 0]), y1 = m.forward([0, 1]);
    progress(true, 'Εγγραφή GeoTIFF αρχικής εικόνας…', 0);
    const blob = await GR.geotiffWriter.write({
      data: getImageData(), width: S.img.width, height: S.img.height,
      transform: [x1[0] - o[0], y1[0] - o[0], o[0], x1[1] - o[1], y1[1] - o[1], o[1]],
      epsg: C.epsgNumber(S.crs), geographic: isGeo(), citation: 'CGeoRef ' + S.crs,
      onProgress: (f) => progress(true, null, f)
    });
    progress(false);
    GR.gcpio.download(blob, baseName() + '_georef_orig.tif');
    if (!C.epsgNumber(S.crs)) { const w = await C.wkt(S.crs); if (w) GR.gcpio.download(w, baseName() + '_georef_orig.prj'); }
    if (!quiet) toast('Αποθηκεύτηκε GeoTIFF αρχικής εικόνας' + (a.approx ? ' (αφινική προσέγγιση)' : ''));
  }

  async function saveOriginalPng() {
    const blob = await new Promise(r => S.img.canvas.toBlob(r, 'image/png'));
    GR.gcpio.download(blob, baseName() + '.png');
  }

  async function saveWorldFile(choice, withPng, quiet) {
    const a = affineFor();
    const w = T.worldFile(a.model);
    // αν η εικόνα δεν μπορεί να ανοιχτεί ως έχει (PDF), αποθηκεύεται αντίγραφο PNG με .pgw
    const needPng = withPng || !['png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'bmp', 'webp'].includes(S.img.ext);
    const ext = needPng && (!choice || choice === 'auto') ? 'pgw' : worldExt(choice);
    GR.gcpio.download([w.A, w.D, w.B, w.E, w.C, w.F].map(fmtW).join('\n') + '\n', baseName() + '.' + ext);
    const wkt = await C.wkt(S.crs);
    if (wkt) GR.gcpio.download(wkt, baseName() + '.prj');
    if (needPng) await saveOriginalPng();
    if (!quiet) toast(`Αποθηκεύτηκε world file .${ext}` + (needPng ? ' + PNG' : '') + (a.approx ? ' (αφινική προσέγγιση)' : ''));
  }

  $('btnSave').addEventListener('click', (e) => {
    if (!checkReady()) return;
    const run = (fn) => async () => { try { await fn(); } catch (err) { console.error(err); toast('Σφάλμα: ' + err.message, true); } finally { progress(false); } };
    popupMenu(e.currentTarget, [
      ['GeoTIFF – αρχική εικόνα (χωρίς επαναδειγματοληψία)', run(() => saveOriginalGeoTiff(false))],
      [`World file (.${worldExt('auto')}) + .prj`, run(() => saveWorldFile('auto', false, false))],
      ['World file (.pgw) + αντίγραφο PNG + .prj', run(() => saveWorldFile('pgw', true, false))],
      ['World file (.wld) + .prj', run(() => saveWorldFile('wld', false, false))],
      ['GeoTIFF με επαναδειγματοληψία (βορράς πάνω)…', () => $('btnExport').click()]
    ]);
  });

  async function runExport() {
    const d = exportDims();
    if (!d) { toast('Μη έγκυρο μέγεθος pixel', true); return; }
    if (d.w * d.h > 150e6) { toast(`Πολύ μεγάλη έξοδος (${d.w}×${d.h}). Αυξήστε το μέγεθος pixel.`, true); return; }
    const name = ($('exName').value.trim() || 'georef').replace(/[\\/:*?"<>|]/g, '_');
    const model = S.fit.model, bb = S.exportGrid.bbox;
    const wkt = await C.wkt(S.crs);
    try {
      const needRaster = $('exTif').checked || $('exPng').checked;
      let res = null;
      if (needRaster) {
        progress(true, 'Γεωαναφορά εικόνας…', 0);
        res = await GR.warp.warp({
          src: getImageData(), srcW: S.img.width, srcH: S.img.height, outW: d.w, outH: d.h,
          method: $('exResample').value, step: 8,
          mapFn: (ox, oy) => model.inverse([bb.minX + ox * d.rx, bb.maxY - oy * d.ry]),
          onProgress: (f) => progress(true, 'Γεωαναφορά εικόνας…', f)
        });
      }
      if ($('exTif').checked) {
        progress(true, 'Εγγραφή GeoTIFF…', 0);
        const blob = await GR.geotiffWriter.write({
          data: res.data, width: d.w, height: d.h, originX: bb.minX, originY: bb.maxY, resX: d.rx, resY: d.ry,
          epsg: C.epsgNumber(S.crs), geographic: isGeo(), citation: 'CGeoRef ' + S.crs,
          onProgress: (f) => progress(true, 'Εγγραφή GeoTIFF…', f)
        });
        GR.gcpio.download(blob, name + '.tif');
        if (!C.epsgNumber(S.crs) && wkt) GR.gcpio.download(wkt, name + '.prj');
      }
      if ($('exPng').checked) {
        progress(true, 'Εγγραφή PNG…', 0.5);
        try {
          const cv = document.createElement('canvas');
          cv.width = d.w; cv.height = d.h;
          cv.getContext('2d').putImageData(new ImageData(res.data, d.w, d.h), 0, 0);
          const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
          if (!blob) throw new Error('υπέρβαση ορίου canvas');
          GR.gcpio.download(blob, name + '.png');
          GR.gcpio.download([d.rx, 0, 0, -d.ry, bb.minX + d.rx / 2, bb.maxY - d.ry / 2].map(v => v.toFixed(10)).join('\n') + '\n', name + '.pgw');
          if (wkt) GR.gcpio.download(wkt, name + '.prj');
        } catch (e) { toast('Αποτυχία PNG: ' + e.message, true); }
      }
      if ($('exPoints').checked) GR.gcpio.download(GR.gcpio.toPoints(S.gcps, S.fit, wkt), baseName() + '.' + S.img.ext + '.points');
      if ($('exOrigTif').checked) await saveOriginalGeoTiff(true);
      if ($('exWld').checked) await saveWorldFile($('exWldExt').value, $('exOrigPng').checked, true);
      else if ($('exOrigPng').checked) await saveOriginalPng();
      if ($('exKml').checked) await exportKml(name);
      if ($('exReport').checked) await makeReport({ resample: $('exResample').selectedOptions[0].textContent, outSize: `${d.w} × ${d.h} px`, outRes: `${fmtRes(d.rx)} × ${fmtRes(d.ry)} ${unit()}` });
      progress(false);
      toast('Η γεωαναφορά ολοκληρώθηκε');
      if ($('exLoad').checked) await showOverlay(true);
    } catch (e) {
      console.error(e);
      toast('Σφάλμα: ' + e.message, true);
    } finally { progress(false); }
  }

  async function exportKml(name) {
    const model = S.fit.model;
    const bb = GR.warp.bbox(GR.warp.borderPoints(S.img.width, S.img.height).map(p => C.transform(S.crs, 'EPSG:4326', model.forward(p))));
    const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
    // διόρθωση αναλογίας για γεωγραφικό πλέγμα
    const kx = Math.cos(((bb.minY + bb.maxY) / 2) * Math.PI / 180);
    const longest = Math.min(4096, Math.max(S.img.width, S.img.height));
    const sc = longest / Math.max(bw * kx, bh);
    const outW = Math.max(1, Math.round(bw * kx * sc)), outH = Math.max(1, Math.round(bh * sc));
    const rx = bw / outW, ry = bh / outH;
    progress(true, 'Δημιουργία KML…', 0);
    const res = await GR.warp.warp({
      src: getImageData(), srcW: S.img.width, srcH: S.img.height, outW, outH, method: 'bilinear',
      mapFn: (ox, oy) => model.inverse(C.transform('EPSG:4326', S.crs, [bb.minX + ox * rx, bb.maxY - oy * ry])),
      onProgress: (f) => progress(true, null, f)
    });
    const cv = document.createElement('canvas');
    cv.width = outW; cv.height = outH;
    cv.getContext('2d').putImageData(new ImageData(res.data, outW, outH), 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    GR.gcpio.download(blob, name + '_wgs84.png');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <GroundOverlay>
    <name>${name}</name>
    <description>CGeoRef – ${T.byId[S.transform].name}</description>
    <Icon><href>${name}_wgs84.png</href></Icon>
    <LatLonBox><north>${bb.maxY}</north><south>${bb.minY}</south><east>${bb.maxX}</east><west>${bb.minX}</west></LatLonBox>
  </GroundOverlay>
</kml>
`;
    GR.gcpio.download(kml, name + '.kml', 'application/vnd.google-earth.kml+xml');
  }

  // ====================== Αναφορά PDF ======================
  async function makeReport(extra) {
    if (!S.img) { toast('Φορτώστε πρώτα μια εικόνα', true); return; }
    if (!S.fit || !S.fit.ok) { toast(S.fit ? S.fit.error : 'Δεν υπάρχουν σημεία ελέγχου', true); return; }
    progress(true, 'Δημιουργία αναφοράς PDF…', 0.3);
    try {
      await GR.report.generate({
        img: S.img, gcps: S.gcps, fit: S.fit, loo: S.loo,
        transform: T.byId[S.transform], lambda: S.lambda,
        crs: S.crs, crsName: C.get(S.crs) ? C.get(S.crs).name : '', unit: unit(), geographic: isGeo(),
        fmtMap, fmtRes, fmtPx, extra: extra || {},
        filename: baseName() + '_report.pdf'
      });
    } catch (e) { console.error(e); toast('Σφάλμα PDF: ' + e.message, true); }
    finally { progress(false); }
  }
  $('btnReport').addEventListener('click', () => makeReport());

  // ====================== GCP αρχεία ======================
  $('btnLoadGcp').addEventListener('click', () => $('fileGcp').click());
  $('fileGcp').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const parsed = GR.gcpio.parse(await f.text(), f.name);
      if (parsed.project) { applyProject(parsed.project); refreshAll(); toast(`Φορτώθηκε έργο με ${S.gcps.length} σημεία`); return; }
      if (!parsed.gcps.length) throw new Error('Δεν βρέθηκαν σημεία');
      if (S.gcps.length && !confirm('Αντικατάσταση των υπαρχόντων σημείων; (Άκυρο = προσθήκη)')) { /* προσθήκη */ }
      else { S.gcps = []; S.nextId = 1; }
      const epsg = GR.gcpio.epsgFromWkt(parsed.crsWkt);
      if (epsg && epsg !== S.crs) {
        try {
          if (!C.get(epsg)) await C.add(epsg);
          fillCrsSelect();
          S.crs = epsg; $('selCrs').value = epsg;
          toast('CRS από το αρχείο: ' + epsg);
        } catch (err) { toast('Άγνωστο CRS στο αρχείο – διατηρείται ' + S.crs, true); }
      }
      parsed.gcps.forEach(g => {
        const id = S.nextId++;
        S.gcps.push({ id, src: g.src, dst: g.dst, enabled: g.enabled });
      });
      refreshAll();
      zoomToGcps();
      toast(`Φορτώθηκαν ${parsed.gcps.length} σημεία ελέγχου`);
    } catch (err) { toast('Σφάλμα ανάγνωσης: ' + err.message, true); }
  });

  function projectJSON() {
    return {
      app: 'CGeoRef', version: 1, imageName: S.img ? S.img.name : null,
      imageSize: S.img ? [S.img.width, S.img.height] : null,
      crs: S.crs, crsDef: C.get(S.crs) ? C.get(S.crs).def : null,
      transform: S.transform, lambda: S.lambda, gcps: S.gcps
    };
  }
  function applyProject(p) {
    if (p.crs) {
      if (!C.get(p.crs) && p.crsDef) { proj4.defs(p.crs, p.crsDef); }
      if (C.get(p.crs) || proj4.defs(p.crs)) { S.crs = p.crs; }
    }
    if (p.transform && T.byId[p.transform]) S.transform = p.transform;
    S.lambda = p.lambda || 0;
    S.gcps = (p.gcps || []).map((g, i) => ({ id: g.id || i + 1, src: g.src.slice(), dst: g.dst.slice(), enabled: g.enabled !== false }));
    S.nextId = S.gcps.reduce((m, g) => Math.max(m, g.id), 0) + 1;
    selT.value = S.transform;
    $('inpLambda').value = S.lambda;
    $('lambdaWrap').classList.toggle('hidden', !T.byId[S.transform].smoothing);
    fillCrsSelect();
  }

  // μενού αποθήκευσης
  $('btnSaveGcp').addEventListener('click', (e) => {
    if (!S.gcps.length) { toast('Δεν υπάρχουν σημεία', true); return; }
    popupMenu(e.currentTarget, [
      ['QGIS .points', async () => GR.gcpio.download(GR.gcpio.toPoints(S.gcps, S.fit, await C.wkt(S.crs)), (S.img ? S.img.name : 'gcps') + '.points')],
      ['CSV (με υπόλοιπα)', () => GR.gcpio.download(GR.gcpio.toCSV(S.gcps, S.fit), baseName() + '_gcps.csv', 'text/csv;charset=utf-8')],
      ['Έργο CGeoRef (.json)', () => GR.gcpio.download(JSON.stringify(projectJSON(), null, 2), baseName() + '.cgeoref.json', 'application/json')]
    ]);
  });

  function popupMenu(anchor, items) {
    const old = document.querySelector('.popup-menu');
    if (old) old.remove();
    const m = document.createElement('div');
    m.className = 'popup-menu';
    const r = anchor.getBoundingClientRect();
    m.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;background:#fff;border:1px solid #d0d7de;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.2);z-index:4000;padding:4px 0;min-width:200px`;
    items.forEach(([label, fn]) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = 'padding:6px 14px;cursor:pointer;color:#1f2328';
      b.onmouseenter = () => (b.style.background = '#f0f3f6');
      b.onmouseleave = () => (b.style.background = '');
      b.onclick = () => { m.remove(); fn(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  }

  // ====================== Αποθήκευση συνεδρίας ======================
  function saveSession() {
    if (!S.img) return;
    try { localStorage.setItem('cgeoref.session', JSON.stringify(projectJSON())); } catch (e) { /* */ }
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem('cgeoref.session')); } catch (e) { return null; }
  }

  // ====================== Zoom ======================
  function zoomToGcps() {
    const lls = S.gcps.map(g => { try { return C.toLatLng(S.crs, g.dst); } catch (e) { return null; } }).filter(x => x && isFinite(x[0]) && isFinite(x[1]));
    if (lls.length === 1) refMap.setView(lls[0], 15);
    else if (lls.length > 1) refMap.fitBounds(lls, { padding: [30, 30] });
  }
  $('btnZoomGcp').addEventListener('click', zoomToGcps);
  $('btnZoomImg').addEventListener('click', () => S.img && imgMap.fitBounds([[-S.img.height, 0], [0, S.img.width]]));

  // ====================== Αρχεία / drag & drop ======================
  const openDialog = () => $('fileImage').click();
  $('btnOpen').addEventListener('click', openDialog);
  $('btnOpen2').addEventListener('click', openDialog);
  $('fileImage').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openImageFile(f); });
  $('btnDemo').addEventListener('click', () => setImage(GR.imageLoader.demoImage()));

  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); $('dropHint').classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); $('dropHint').classList.remove('dragover'); }));
  document.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    const gcpF = files.find(f => /\.(points|csv|json)$/i.test(f.name));
    const imgF = files.find(f => !/\.(points|csv|json|txt)$/i.test(f.name));
    if (imgF) openImageFile(imgF).then(() => { if (gcpF) loadGcpFile(gcpF); });
    else if (gcpF) loadGcpFile(gcpF);
  });
  function loadGcpFile(f) {
    const dt = new DataTransfer(); dt.items.add(f);
    $('fileGcp').files = dt.files;
    $('fileGcp').dispatchEvent(new Event('change'));
  }

  // ====================== Splitters ======================
  function splitter(el, onMove) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('drag');
      el.setPointerCapture(e.pointerId);
      const mv = (ev) => onMove(ev);
      const up = () => {
        el.classList.remove('drag');
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        imgMap.invalidateSize(); refMap.invalidateSize();
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
  }
  splitter($('vSplit'), (e) => {
    const w = $('workspace').getBoundingClientRect();
    const pct = Math.max(15, Math.min(85, (e.clientX - w.left) / w.width * 100));
    document.documentElement.style.setProperty('--splitL', pct + '%');
    imgMap.invalidateSize({ pan: false }); refMap.invalidateSize({ pan: false });
  });
  splitter($('hSplit'), (e) => {
    const h = Math.max(80, Math.min(window.innerHeight - 200, window.innerHeight - e.clientY - 24));
    document.documentElement.style.setProperty('--gcpH', h + 'px');
    imgMap.invalidateSize({ pan: false }); refMap.invalidateSize({ pan: false });
  });
  window.addEventListener('resize', () => { imgMap.invalidateSize(); refMap.invalidateSize(); });

  function makeDraggable(box, handle) {
    handle.addEventListener('pointerdown', (e) => {
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const mv = (ev) => { box.style.left = (ev.clientX - dx) + 'px'; box.style.top = (ev.clientY - dy) + 'px'; };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up);
    });
  }

  // ====================== Πληκτρολόγιο ======================
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === 'a') setTool('add');
    else if (k === 'p') setTool('pan');
    else if (k === 'm') setTool('move');
    else if (k === 'd') setTool('delete');
    else if (k === 'escape') cancelPending();
    else if ((k === 'delete' || k === 'backspace') && S.selected != null) deleteGcp(S.selected);
  });

  // ====================== Βοήθεια ======================
  $('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
  $('helpTransforms').innerHTML = '<table><tr><th>Μετασχηματισμός</th><th>Ελάχ. σημεία</th><th>Περιγραφή</th></tr>' +
    T.LIST.map(t => `<tr><td><b>${t.name}</b></td><td>${t.minPts}</td><td>${t.desc}</td></tr>`).join('') + '</table>';

  // ====================== Εκκίνηση ======================
  fillCrsSelect();
  const saved = loadSession();
  if (saved && saved.crs && C.get(saved.crs)) { S.crs = saved.crs; $('selCrs').value = S.crs; }
  if (saved && saved.transform && T.byId[saved.transform]) { S.transform = saved.transform; selT.value = S.transform; }
  $('lambdaWrap').classList.toggle('hidden', !T.byId[S.transform].smoothing);
  setTool('pan');
  refreshAll();

  GR.app = { S, imgMap, refMap, addGcp, setImage, refreshAll, showOverlay };
})(window.GR = window.GR || {});
