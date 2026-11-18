/* CFiles — optional AI (LLM) synthetic data, called directly from the browser (no backend). */
(function () {
  'use strict';

  /**
   * No backend is involved in any of these:
   * - webllm: the model runs inside the browser (WebGPU). Free, no key, data never leaves the device.
   *           The first run downloads the model (~1 GB) and caches it in the browser.
   * - openrouter / groq / gemini: free tiers with the user's own key (CORS-enabled APIs).
   * - custom: any OpenAI-compatible endpoint (e.g. a local Ollama / LM Studio server).
   */
  const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';
  const PROVIDERS = {
    webllm: {
      label: 'WebLLM — in-browser, free, no key',
      style: 'webllm', model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', needsKey: false,
      models: ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-3B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'Phi-3.5-mini-instruct-q4f16_1-MLC'],
    },
    openrouter: {
      label: 'OpenRouter — free models (your key)',
      style: 'openai', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free', needsKey: true,
      keyUrl: 'https://openrouter.ai/keys',
    },
    groq: {
      label: 'Groq — free tier (your key)',
      style: 'openai', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', needsKey: true,
      keyUrl: 'https://console.groq.com/keys',
    },
    gemini: {
      label: 'Google Gemini — free tier (your key)',
      style: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-flash-latest', needsKey: true,
      keyUrl: 'https://aistudio.google.com/app/apikey',
    },
    custom: {
      label: 'Custom OpenAI-compatible endpoint',
      style: 'openai', url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', needsKey: false, custom: true,
    },
  };

  const FORMAT_RULES = {
    json: 'Return a single valid JSON document (RFC 8259). Use double quotes. No comments, no trailing commas.',
    yaml: 'Return a single valid YAML 1.2 document. Use 2-space indentation.',
    csv: 'Return valid RFC 4180 CSV with a header row in the first line. Quote fields that contain the delimiter, quotes or newlines.',
    txt: 'Return plain text only.',
  };

  function buildPrompt({ format, count, locale, prompt, fields, delimiter }) {
    const lang = locale === 'el' ? 'Greek (Ελληνικά)' : 'English';
    const system =
      'You are a synthetic test-data generator. Produce realistic but entirely fictional data — never real people, ' +
      'real contact details or real personal identifiers. Use reserved example domains (example.com, example.org) for emails/URLs. ' +
      'Output ONLY the raw file content: no explanations, no markdown, no code fences.';
    let user = `Create a ${format.toUpperCase()} file.\n${FORMAT_RULES[format]}\n`;
    if (format === 'csv' && delimiter && delimiter !== ',') user += `Use "${delimiter === '\t' ? 'TAB' : delimiter}" as the delimiter.\n`;
    if (format === 'json' || format === 'yaml') user += 'The root should be an array of records unless the description says otherwise.\n';
    user += `Number of records / entries: ${count}.\nLanguage for the text values: ${lang}.\n`;
    if (fields && fields.length) user += `Use exactly these fields (in this order): ${fields.join(', ')}.\n`;
    user += `Description: ${prompt && prompt.trim() ? prompt.trim() : 'generic realistic sample records'}`;
    return { system, user };
  }

  function httpError(status, body, retryAfter) {
    let msg = body;
    try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || j.message || body; } catch (e) { /* plain text */ }
    const err = new Error(`HTTP ${status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 300)}`);
    err.status = status;
    err.body = body;
    const ra = Number(retryAfter);
    if (Number.isFinite(ra) && ra > 0) err.retryAfter = ra;
    return err;
  }

  /** True for temporary overload / rate-limit errors that are worth retrying. */
  const isBusy = (e) => !!e && [429, 500, 502, 503, 504].includes(e.status);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RETRY_DELAYS = [2000, 5000, 10000];

  /** True when the error means "this model name is unknown / retired". */
  function isModelError(e) {
    if (!e || !e.status) return false;
    if (e.status === 404) return true;
    return (e.status === 400 || e.status === 422) && /model/i.test(e.body || '') && /(not|no longer|invalid|unknown|decommission|deprecat|exist|support)/i.test(e.body || '');
  }

  /* ---------- model discovery (asks the provider which models exist right now) ---------- */
  const BAD = /(embed|tts|audio|whisper|image|vision-only|guard|moderation|live|transcri|speech|aqa|imagen|veo|robotics|computer-use)/i;

  async function listModels(provider, { key, endpoint } = {}) {
    const p = PROVIDERS[provider];
    if (!p) return [];
    if (p.style === 'webllm') return p.models.slice();
    if (p.style === 'gemini') {
      if (!key) throw new Error('Enter your API key first.');
      const res = await fetch(`${p.url}?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      const body = await res.text();
      if (!res.ok) throw httpError(res.status, body);
      return (JSON.parse(body).models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((id) => /^gemini/i.test(id) && !BAD.test(id));
    }
    const base = (p.custom ? endpoint || p.url : p.url).replace(/\/chat\/completions\/?$/, '');
    const headers = key ? { Authorization: `Bearer ${key}` } : {};
    const res = await fetch(base + '/models', { headers });
    const body = await res.text();
    if (!res.ok) throw httpError(res.status, body);
    let ids = (JSON.parse(body).data || []).filter((m) => m.active !== false).map((m) => m.id).filter((id) => !BAD.test(id));
    if (provider === 'openrouter') ids = ids.filter((id) => id.endsWith(':free'));
    return ids;
  }

  const verOf = (id) => (id.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;

  /** Pick a sensible default model from a provider's live list. */
  function pickModel(provider, ids) {
    if (!ids.length) return null;
    const unstable = /(preview|exp|thinking|tuning|lite)/i;
    if (provider === 'gemini') {
      const flash = ids.filter((id) => /^gemini-[\d.]+-flash$/.test(id));
      const pool = flash.length ? flash : ids.filter((id) => /flash/i.test(id) && !unstable.test(id));
      const list = pool.length ? pool : ids;
      return list.slice().sort((a, b) => verOf(b) - verOf(a))[0];
    }
    const prefs = [/llama.*70b/i, /gpt-oss/i, /qwen/i, /deepseek/i, /llama/i, /gemma/i, /mistral/i];
    for (const re of prefs) {
      const hit = ids.filter((id) => re.test(id) && !unstable.test(id));
      if (hit.length) return hit.sort((a, b) => verOf(b) - verOf(a))[0];
    }
    return ids[0];
  }

  async function callOpenAI(p, { url, model, key, system, user, temperature, signal }) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (p === PROVIDERS.openrouter) { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'CFiles'; }
    const res = await fetch(url, {
      method: 'POST', headers, signal,
      body: JSON.stringify({ model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const body = await res.text();
    if (!res.ok) throw httpError(res.status, body, res.headers.get('retry-after'));
    let json;
    try { json = JSON.parse(body); } catch (e) { return body; } // some endpoints may return plain text
    const msg = json.choices && json.choices[0] && json.choices[0].message;
    if (!msg || typeof msg.content !== 'string') throw new Error('Unexpected response: ' + body.slice(0, 200));
    return msg.content;
  }

  async function callGemini(p, { model, key, system, user, temperature, signal }) {
    const res = await fetch(`${p.url}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature },
      }),
    });
    const body = await res.text();
    if (!res.ok) throw httpError(res.status, body, res.headers.get('retry-after'));
    const json = JSON.parse(body);
    const parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    if (!parts) throw new Error('Unexpected response: ' + body.slice(0, 200));
    return parts.map((x) => x.text || '').join('');
  }

  let webllmEngine = null;
  let webllmModel = null;
  async function callWebLLM(p, { model, system, user, temperature, onProgress }) {
    if (!('gpu' in navigator)) throw new Error('WebLLM needs a browser with WebGPU (recent Chrome / Edge, or Safari 26+).');
    const webllm = await import(WEBLLM_URL);
    if (!webllmEngine || webllmModel !== model) {
      if (webllmEngine) { try { await webllmEngine.unload(); } catch (e) { /* ignore */ } }
      webllmEngine = await webllm.CreateMLCEngine(model, {
        initProgressCallback: (r) => onProgress && onProgress(r.text || `Loading model… ${Math.round((r.progress || 0) * 100)}%`),
      });
      webllmModel = model;
    }
    onProgress && onProgress('Generating…');
    const res = await webllmEngine.chat.completions.create({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
    });
    return res.choices[0].message.content;
  }

  /** Remove code fences / chatter and validate the payload for the requested format. */
  function clean(text, format) {
    let t = String(text || '').trim();
    const fence = /```[\w-]*\s*\n([\s\S]*?)```/.exec(t);
    if (fence) t = fence[1].trim();
    if (format === 'json') {
      const i = t.search(/[[{]/);
      const j = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
      if (i > 0 || (j > -1 && j < t.length - 1)) t = t.slice(Math.max(0, i), j + 1);
      t = JSON.stringify(JSON.parse(t), null, 2); // validates + pretty prints
    } else if (format === 'yaml') {
      if (CF.util.hasYaml()) jsyaml.load(t, { schema: jsyaml.CORE_SCHEMA });
    } else if (format === 'csv') {
      const rows = CF.csv.parse(t, CF.csv.sniff(t) ? CF.csv.sniff(t).delimiter : ',');
      if (rows.length < 2) throw new Error('The model did not return CSV rows.');
    }
    return t.endsWith('\n') ? t : t + '\n';
  }

  async function generate(o) {
    const p = PROVIDERS[o.provider];
    if (!p) throw new Error('Unknown provider.');
    if (p.needsKey && !o.key) throw new Error('This provider needs an API key.');
    const url = p.custom ? o.endpoint || p.url : p.url;
    const model = o.model || p.model;
    const { system, user } = buildPrompt(o);
    const progress = (t) => o.onProgress && o.onProgress(t);
    const base = { url, key: o.key, system, user, temperature: o.temperature ?? 0.8, onProgress: o.onProgress };
    const call = (a) => (p.style === 'webllm' ? callWebLLM(p, a)
      : p.style === 'gemini' ? callGemini(p, a)
        : callOpenAI(p, a));

    /** One model, retried with back-off while the provider reports it is busy (429 / 5xx). */
    async function attempt(m, delays) {
      for (let i = 0; ; i++) {
        const ctrl = new AbortController();
        // Local models need time to download on first use, so no timeout for WebLLM.
        const timer = p.style === 'webllm' ? 0 : setTimeout(() => ctrl.abort(), 90000);
        try {
          return await call(Object.assign({}, base, { model: m, signal: ctrl.signal }));
        } catch (e) {
          if (!isBusy(e) || i >= delays.length) throw e;
          let wait = delays[i];
          if (e.retryAfter) wait = Math.min(30000, Math.max(wait, e.retryAfter * 1000));
          progress(`${m} is busy (HTTP ${e.status}) — retrying in ${Math.round(wait / 1000)} s (${i + 1}/${delays.length})…`);
          await sleep(wait);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    try {
      let raw;
      try {
        raw = await attempt(model, RETRY_DELAYS);
      } catch (e) {
        // Retired model, or still overloaded after retries: try other models from the provider's live list.
        const retired = isModelError(e);
        if (p.style === 'webllm' || !(retired || isBusy(e))) throw e;
        progress(retired ? `Model "${model}" is not available — looking up current models…` : `${model} is still busy — trying another model…`);
        let ids = [];
        try { ids = await listModels(o.provider, { key: o.key, endpoint: o.endpoint }); } catch (e2) { throw e; }
        const tried = new Set([model]);
        let lastErr = e;
        for (let k = 0; k < 3 && raw === undefined; k++) {
          const alt = pickModel(o.provider, ids.filter((id) => !tried.has(id)));
          if (!alt) break;
          tried.add(alt);
          progress(`Trying ${alt}…`);
          try {
            raw = await attempt(alt, [3000]);
            if (o.onModelChange) o.onModelChange(alt, ids, retired ? 'retired' : 'busy');
          } catch (e2) {
            lastErr = e2;
            if (!(isModelError(e2) || isBusy(e2))) throw e2;
          }
        }
        if (raw === undefined) throw lastErr;
      }
      return clean(raw, o.format);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The AI request timed out.');
      if (e instanceof TypeError && p.style !== 'webllm') throw new Error('Network/CORS error — the provider could not be reached from the browser.');
      if (isBusy(e)) throw new Error(`The provider is overloaded right now (HTTP ${e.status}). Please try again in a minute.`);
      throw e;
    }
  }

  CF.ai = { PROVIDERS, generate, buildPrompt, clean, listModels, pickModel };
})();
