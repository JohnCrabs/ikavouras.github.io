/* CFiles — "Create Synthetic Files" dialog (local generator + optional AI) */
(function () {
  'use strict';
  const U = CF.util;
  const S = CF.synth;
  const ALLOWED = new Set(['json', 'yaml', 'csv', 'txt']); // BIN deliberately excluded (security)
  let tab = 'local';
  let busy = false;

  function $(id) { return document.getElementById(id); }

  function selectedFields() {
    return U.$$('#sfFields input:checked').map((i) => i.value);
  }

  function setFields(list) {
    const set = new Set(list);
    for (const i of U.$$('#sfFields input')) i.checked = set.has(i.value);
  }

  function renderFields() {
    const host = $('sfFields');
    host.textContent = '';
    for (const [key, def] of Object.entries(S.FIELDS)) {
      host.append(U.el('label', { title: def.group }, U.el('input', { type: 'checkbox', value: key }), def.label));
    }
  }

  function updateVisibility() {
    const fmt = $('sfFormat').value;
    for (const n of U.$$('.fmt-csv')) n.classList.toggle('hidden', fmt !== 'csv');
    for (const n of U.$$('.fmt-txt')) n.classList.toggle('hidden', fmt !== 'txt');
    for (const n of U.$$('.fmt-tree')) n.classList.toggle('hidden', !(fmt === 'json' || fmt === 'yaml'));
    const txtNoFields = fmt === 'txt' && $('sfTxtMode').value !== 'records';
    U.$('.fields-box').classList.toggle('hidden', txtNoFields);
    const p = CF.ai.PROVIDERS[$('aiProvider').value];
    for (const n of U.$$('.ai-key')) n.classList.toggle('hidden', !p.needsKey && !p.custom);
    U.$('.ai-endpoint').classList.toggle('hidden', !p.custom);
    const link = $('aiKeyLink');
    link.classList.toggle('hidden', !p.keyUrl);
    if (p.keyUrl) { link.href = p.keyUrl; link.textContent = 'Get a free key ↗'; }
    $('sfGenerate').textContent = tab === 'ai' ? '✨ Generate with AI' : 'Generate';
  }

  function loadProviderSettings() {
    const id = $('aiProvider').value;
    const p = CF.ai.PROVIDERS[id];
    $('aiModel').value = U.store.get(`cf.ai.${id}.model`, p.model);
    const dl = $('aiModels');
    dl.textContent = '';
    for (const m of p.models || [p.model]) dl.append(U.el('option', { value: m }));
    $('aiEndpoint').value = U.store.get(`cf.ai.${id}.endpoint`, p.url);
    const saved = U.store.get(`cf.ai.${id}.key`, '');
    $('aiKey').value = saved || sessionKeys[id] || '';
    $('aiRemember').checked = !!saved;
  }
  const sessionKeys = {};

  function saveSettings() {
    const id = $('aiProvider').value;
    U.store.set('cf.synth', JSON.stringify({
      format: $('sfFormat').value, count: $('sfCount').value, locale: $('sfLocale').value, preset: $('sfPreset').value,
      fields: selectedFields(), delim: $('sfDelim').value, txtMode: $('sfTxtMode').value, nested: $('sfNested').checked,
      provider: id, prompt: $('aiPrompt').value, useFields: $('aiUseFields').checked, fallback: $('aiFallback').checked, tab,
    }));
    U.store.set(`cf.ai.${id}.model`, $('aiModel').value.trim());
    if (CF.ai.PROVIDERS[id].custom) U.store.set(`cf.ai.${id}.endpoint`, $('aiEndpoint').value.trim());
    const key = $('aiKey').value.trim();
    sessionKeys[id] = key;
    if ($('aiRemember').checked && key) U.store.set(`cf.ai.${id}.key`, key);
    else U.store.del(`cf.ai.${id}.key`);
  }

  function restore() {
    let s = {};
    try { s = JSON.parse(U.store.get('cf.synth', '{}')) || {}; } catch (e) { s = {}; }
    if (s.format && ALLOWED.has(s.format)) $('sfFormat').value = s.format;
    if (s.count) $('sfCount').value = s.count;
    if (s.locale) $('sfLocale').value = s.locale;
    if (s.preset && S.PRESETS[s.preset]) $('sfPreset').value = s.preset;
    setFields(s.fields && s.fields.length ? s.fields : S.PRESETS[$('sfPreset').value].fields);
    if (s.delim) $('sfDelim').value = s.delim;
    if (s.txtMode) $('sfTxtMode').value = s.txtMode;
    $('sfNested').checked = !!s.nested;
    if (s.provider && CF.ai.PROVIDERS[s.provider]) $('aiProvider').value = s.provider;
    if (s.prompt) $('aiPrompt').value = s.prompt;
    if (s.useFields !== undefined) $('aiUseFields').checked = s.useFields;
    if (s.fallback !== undefined) $('aiFallback').checked = s.fallback;
    if (s.tab) switchTab(s.tab);
    loadProviderSettings();
  }

  function switchTab(t) {
    tab = t;
    for (const b of U.$$('#synthDialog .tab')) b.classList.toggle('active', b.dataset.tab === t);
    for (const p of U.$$('#synthDialog .tab-panel')) p.classList.toggle('hidden', p.dataset.panel !== t);
    updateVisibility();
  }

  function msg(text, isError) {
    const m = $('sfMsg');
    m.innerHTML = '';
    m.className = 'muted small' + (isError ? ' error' : '');
    if (text) m.append(typeof text === 'string' ? text : text);
  }

  function collect() {
    const format = $('sfFormat').value;
    if (!ALLOWED.has(format)) throw new Error('Synthetic generation is not available for this format.');
    let name = $('sfName').value.trim() || 'synthetic';
    name = name.replace(/[\\/:*?"<>|]+/g, '_');
    if (U.extOf(name) !== format) name = U.replaceExt(name, format);
    const count = Math.max(1, Math.min(100000, parseInt($('sfCount').value, 10) || 25));
    return {
      format, name, count,
      locale: $('sfLocale').value,
      seed: $('sfSeed').value.trim(),
      fields: selectedFields(),
      nested: $('sfNested').checked,
      delimiter: $('sfDelim').value,
      txtMode: $('sfTxtMode').value,
    };
  }

  function localGenerate(o) {
    const text = S.generate(o);
    CF.app.openText(o.name, text, o.format, 'synthetic (local generator)');
    return text;
  }

  async function onGenerate() {
    if (busy) return;
    let o;
    try { o = collect(); } catch (e) { msg(e.message, true); return; }
    saveSettings();
    if (tab === 'local') {
      try {
        localGenerate(o);
        $('synthDialog').close();
        U.toast(`Created ${o.name} (${o.count} records).`, 'ok');
      } catch (e) { msg(e.message, true); }
      return;
    }
    // AI
    const provider = $('aiProvider').value;
    if (provider === 'webllm' && U.store.get('cf.webllm.ok', '') !== '1') {
      const ok = confirm('WebLLM runs the AI model inside your browser.\n\nThe first time, the model is downloaded (about 1 GB for the default model) and cached by the browser. Nothing is sent to any server.\n\nContinue?');
      if (!ok) return;
      U.store.set('cf.webllm.ok', '1');
    }
    const aiCount = Math.min(o.count, 200);
    if (o.count > 200) U.toast('AI generation is limited to 200 records per request.', 'warn');
    busy = true;
    const btn = $('sfGenerate');
    btn.disabled = true;
    const sp = U.el('span', {}, U.el('span', { class: 'spinner' }), ` Asking ${CF.ai.PROVIDERS[provider].label.split(' — ')[0]}…`);
    msg(sp);
    try {
      const text = await CF.ai.generate({
        provider, format: o.format, count: aiCount, locale: o.locale,
        prompt: $('aiPrompt').value,
        fields: $('aiUseFields').checked ? o.fields : [],
        delimiter: o.delimiter,
        model: $('aiModel').value.trim(),
        endpoint: $('aiEndpoint').value.trim(),
        key: $('aiKey').value.trim(),
        onProgress: (t) => { sp.lastChild.textContent = ' ' + String(t).slice(0, 140); },
      });
      CF.app.openText(o.name, text, o.format, 'synthetic (AI: ' + provider + ')');
      $('synthDialog').close();
      U.toast(`Created ${o.name} with AI.`, 'ok');
    } catch (e) {
      if ($('aiFallback').checked) {
        try {
          localGenerate(o);
          $('synthDialog').close();
          U.toast(`AI failed (${e.message}). Used the local generator instead.`, 'warn', 7000);
        } catch (e2) { msg(e2.message, true); }
      } else {
        msg('AI error: ' + e.message, true);
      }
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  function init() {
    const dlg = $('synthDialog');
    const presetSel = $('sfPreset');
    for (const [k, p] of Object.entries(S.PRESETS)) presetSel.append(U.el('option', { value: k, text: p.label }));
    const provSel = $('aiProvider');
    for (const [k, p] of Object.entries(CF.ai.PROVIDERS)) provSel.append(U.el('option', { value: k, text: p.label }));
    renderFields();
    restore();

    presetSel.addEventListener('change', () => { const f = S.PRESETS[presetSel.value].fields; if (f.length) setFields(f); });
    $('sfFields').addEventListener('change', () => { presetSel.value = 'custom'; });
    $('sfAll').addEventListener('click', () => { setFields(Object.keys(S.FIELDS)); presetSel.value = 'custom'; });
    $('sfNone').addEventListener('click', () => { setFields([]); presetSel.value = 'custom'; });
    $('sfFormat').addEventListener('change', updateVisibility);
    $('sfTxtMode').addEventListener('change', updateVisibility);
    provSel.addEventListener('change', () => { loadProviderSettings(); updateVisibility(); });
    for (const b of U.$$('#synthDialog .tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));
    $('sfGenerate').addEventListener('click', onGenerate);
    dlg.addEventListener('close', () => { if (!busy) msg(''); });
    // Enter inside a text field generates instead of submitting the first (close) button.
    $('synthForm').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); onGenerate(); }
    });
    updateVisibility();
  }

  CF.synthDialog = {
    open() {
      if (!CF.synthDialog.ready) { init(); CF.synthDialog.ready = true; }
      msg('');
      updateVisibility();
      $('synthDialog').showModal();
    },
  };
})();
