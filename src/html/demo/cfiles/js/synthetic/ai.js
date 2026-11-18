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
      style: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.5-flash', needsKey: true,
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

  async function callOpenAI(p, { url, model, key, system, user, temperature, signal }) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (p === PROVIDERS.openrouter) { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'CFiles'; }
    const res = await fetch(url, {
      method: 'POST', headers, signal,
      body: JSON.stringify({ model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
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
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
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
    const ctrl = new AbortController();
    // Local models need time to download on first use, so no timeout for WebLLM.
    const timer = p.style === 'webllm' ? 0 : setTimeout(() => ctrl.abort(), 90000);
    const args = { url, model, key: o.key, system, user, temperature: o.temperature ?? 0.8, signal: ctrl.signal, onProgress: o.onProgress };
    try {
      const raw = p.style === 'webllm' ? await callWebLLM(p, args)
        : p.style === 'gemini' ? await callGemini(p, args)
          : await callOpenAI(p, args);
      return clean(raw, o.format);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The AI request timed out.');
      if (e instanceof TypeError && p.style !== 'webllm') throw new Error('Network/CORS error — the provider could not be reached from the browser.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  CF.ai = { PROVIDERS, generate, buildPrompt, clean };
})();
