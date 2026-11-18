// AI assistant: providers (Anthropic Claude, any OpenAI-compatible endpoint such as Ollama / LM Studio),
// chat panel, inline completions and "fix with AI".
// Everything runs in the browser: the API key is stored only in this browser's localStorage.
import { Emitter, h, store, escapeHtml, copyText, toast } from './util.js';

export const AI_DEFAULTS = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-opus-5-5',
  baseUrl: '',
  effort: '',            // '' = model default; low | medium | high | xhigh | max
  inline: false,         // ghost-text completions while typing
  inlineModel: '',       // '' = same as model
};
const ANTHROPIC_URL = 'https://api.anthropic.com';
const FALLBACK_MODELS = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
const NO_EFFORT = /haiku-4|sonnet-4-5|claude-3/;

export const SYSTEM_PROMPT = `You are CDev Assistant, a senior programming assistant embedded in a lightweight web code editor.
The user runs their code locally with their own compilers/interpreters configured in exec_settings.json.
Guidelines:
- Be concise and practical. Prefer showing code over long explanations.
- When you change a file, output the COMPLETE updated file in one fenced code block with the language tag, so the editor can apply it.
- For small additions, a focused snippet is fine.
- Use the language and style already present in the user's code.
- Answer in the language the user writes in.`;

export class AI extends Emitter {
  constructor() {
    super();
    this.cfg = { ...AI_DEFAULTS, ...store.get('ai', {}) };
  }
  save(cfg) { this.cfg = { ...this.cfg, ...cfg }; store.set('ai', this.cfg); this.emit('config', this.cfg); }
  configured() { return this.cfg.provider === 'openai' ? !!(this.cfg.baseUrl || this.cfg.apiKey) : !!this.cfg.apiKey; }

  // Streams text chunks. messages: [{role:'user'|'assistant', content:string}]
  async *stream({ system = SYSTEM_PROMPT, messages, model, maxTokens = 16000, effort, signal }) {
    const c = this.cfg;
    model = model || c.model;
    if (c.provider === 'openai') { yield* this._openaiStream({ system, messages, model, maxTokens, signal }); return; }
    const body = { model, max_tokens: maxTokens, stream: true, system, messages };
    const eff = effort ?? c.effort;
    if (eff && !NO_EFFORT.test(model)) body.output_config = { effort: eff };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': c.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (FALLBACK_MODELS.includes(model)) {
      // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    const res = await fetch((c.baseUrl || ANTHROPIC_URL).replace(/\/+$/, '') + '/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    });
    if (!res.ok) throw new Error(await this._err(res));
    for await (const ev of sse(res, signal)) {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text;
      else if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'refusal') yield '\n\n_[The model declined this request.]_';
      else if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'max_tokens') yield '\n\n_[Output truncated: max tokens reached.]_';
      else if (ev.type === 'error') throw new Error(ev.error?.message || 'Stream error');
    }
  }

  async *_openaiStream({ system, messages, model, maxTokens, signal }) {
    const c = this.cfg;
    const base = (c.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
    const headers = { 'content-type': 'application/json' };
    if (c.apiKey) headers.authorization = 'Bearer ' + c.apiKey;
    const res = await fetch(base + '/chat/completions', {
      method: 'POST', headers, signal,
      body: JSON.stringify({ model, stream: true, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] }),
    });
    if (!res.ok) throw new Error(await this._err(res));
    for await (const ev of sse(res, signal)) {
      const t = ev.choices?.[0]?.delta?.content;
      if (t) yield t;
    }
  }

  async _err(res) {
    let t = '';
    try { const j = await res.json(); t = j.error?.message || j.error || JSON.stringify(j); } catch { t = res.statusText; }
    if (res.status === 401) t += ' (check your API key in AI settings)';
    return `AI request failed (${res.status}): ${t}`;
  }

  async complete(opts) {
    let out = '';
    for await (const t of this.stream(opts)) out += t;
    return out;
  }

  // Inline (ghost text) completion
  async inlineComplete({ prefix, suffix, language, path, signal }) {
    const model = this.cfg.inlineModel || this.cfg.model;
    const text = await this.complete({
      model, maxTokens: 2048, effort: this.cfg.provider === 'anthropic' ? 'low' : undefined, signal,
      system: 'You are a code completion engine. Reply with ONLY the code that should be inserted at <CURSOR/>: no explanations, no markdown fences, no repetition of the surrounding code. Keep it short (usually one line, at most ~8 lines). If nothing sensible, reply with an empty string.',
      messages: [{ role: 'user', content: `File: ${path} (${language})\n\n${prefix}<CURSOR/>${suffix}` }],
    });
    return stripFences(text).replace(/^\n+/, '');
  }
}

async function* sse(res, signal) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (signal?.aborted) { reader.cancel(); return; }
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      try { yield JSON.parse(data); } catch { /* ignore */ }
    }
  }
}

export function stripFences(text) {
  const m = /```[\w+#.-]*\n([\s\S]*?)```/.exec(text);
  return m ? m[1].replace(/\n$/, '') : text.trim() === '' ? '' : text;
}

export function extractCodeBlocks(text) {
  const out = [];
  const re = /```([\w+#.-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) out.push({ lang: m[1], code: m[2].replace(/\n$/, '') });
  return out;
}

// --- minimal markdown renderer (safe: escapes everything first) ---
export function renderMarkdown(text, onCode) {
  const root = h('div');
  const re = /```([\w+#.-]*)\n?([\s\S]*?)(```|$)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) root.append(renderInline(text.slice(last, m.index)));
    root.append(onCode(m[1], m[2].replace(/\n$/, ''), m[3] === '```'));
    last = m.index + m[0].length;
    if (!m[0]) break;
  }
  if (last < text.length) root.append(renderInline(text.slice(last)));
  return root;
}

function renderInline(text) {
  const frag = document.createDocumentFragment();
  const blocks = text.split(/\n{2,}/);
  for (const b of blocks) {
    if (!b.trim()) continue;
    const lines = b.split('\n');
    if (lines.every(l => /^\s*([-*]|\d+\.)\s+/.test(l) || !l.trim())) {
      const ordered = /^\s*\d+\./.test(lines[0]);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      for (const l of lines) if (l.trim()) list.append(h('li', { html: inline(l.replace(/^\s*([-*]|\d+\.)\s+/, '')) }));
      frag.append(list);
    } else if (/^#{1,4}\s/.test(b)) {
      frag.append(h('h4', { html: inline(b.replace(/^#+\s*/, '')) }));
    } else {
      frag.append(h('p', { html: lines.map(inline).join('<br>') }));
    }
  }
  return frag;
}

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/_\[([^\]]+)\]_/g, '<i>[$1]</i>');
}

// ---------------- Chat panel ----------------
export class ChatPanel extends Emitter {
  constructor(ai, els, getContext) {
    super();
    this.ai = ai; this.els = els; this.getContext = getContext;
    this.history = [];
    this.abort = null;
    els.form.addEventListener('submit', e => { e.preventDefault(); this.send(); });
    els.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); }
    });
    els.stop.addEventListener('click', () => this.abort?.abort());
    els.clear.addEventListener('click', () => this.reset());
    this.reset();
  }

  reset() {
    this.abort?.abort();
    this.history = [];
    this.els.messages.innerHTML = '';
    this._note(this.ai.configured()
      ? 'Ask anything about your code. The current file, selection and problems are attached automatically (toggle below).'
      : 'Set up an AI provider first: ⚙️ Settings → AI (Claude API key, or a local Ollama / LM Studio endpoint).');
  }

  _note(text) { this.els.messages.append(h('div', { class: 'msg note' }, text)); }

  async send(text, { attachContext = true, onDone } = {}) {
    text = (text ?? this.els.input.value).trim();
    if (!text || this.abort) return;
    if (!this.ai.configured()) { this.emit('needsConfig'); return; }
    this.els.input.value = '';
    const ctx = attachContext ? this.getContext() : '';
    const content = ctx ? `${ctx}\n\n---\n${text}` : text;
    this.els.messages.append(h('div', { class: 'msg user' }, text));
    this.history.push({ role: 'user', content });
    const bubble = h('div', { class: 'msg assistant typing' });
    this.els.messages.append(bubble);
    this._scroll();
    this.abort = new AbortController();
    this.els.stop.hidden = false; this.els.send.disabled = true;
    let out = '';
    try {
      let pending = false;
      for await (const t of this.ai.stream({ messages: this.history, signal: this.abort.signal })) {
        out += t;
        if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; this._renderInto(bubble, out, false); this._scroll(); }); }
      }
      this._renderInto(bubble, out, true);
      this.history.push({ role: 'assistant', content: out || '(empty)' });
      onDone && onDone(out);
    } catch (e) {
      if (e.name === 'AbortError') { this._renderInto(bubble, out + '\n\n_[stopped]_', true); if (out) this.history.push({ role: 'assistant', content: out }); else this.history.pop(); }
      else { bubble.className = 'msg error'; bubble.textContent = e.message; this.history.pop(); }
    } finally {
      bubble.classList.remove('typing');
      this.abort = null;
      this.els.stop.hidden = true; this.els.send.disabled = false;
      this._scroll();
    }
  }

  _scroll() { const m = this.els.messages; m.scrollTop = m.scrollHeight; }

  _renderInto(el, text, final) {
    el.innerHTML = '';
    el.append(renderMarkdown(text || '…', (lang, code, closed) => {
      const pre = h('pre', {}, code);
      const head = h('div', { class: 'cb-head' }, h('span', {}, lang || 'code'), h('span', { class: 'spacer' }));
      if (closed || final) {
        head.append(
          h('button', { title: 'Copy', onclick: () => copyText(code) }, 'Copy'),
          h('button', { title: 'Insert at cursor', onclick: () => this.emit('insert', code) }, 'Insert'),
          h('button', { title: 'Show a diff and apply to the current file', onclick: () => this.emit('apply', code, lang) }, 'Apply…'),
        );
      }
      return h('div', { class: 'codeblock' }, head, pre);
    }));
  }
}

export function aiSettingsForm(ai) {
  const c = ai.cfg;
  const provider = h('select', {},
    h('option', { value: 'anthropic', selected: c.provider === 'anthropic' }, 'Anthropic (Claude)'),
    h('option', { value: 'openai', selected: c.provider === 'openai' }, 'OpenAI-compatible (Ollama, LM Studio, …)'));
  const key = h('input', { type: 'password', value: c.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const model = h('input', { value: c.model, list: 'ai-models' });
  const models = h('datalist', { id: 'ai-models' }, ...['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'llama3.1', 'qwen2.5-coder'].map(m => h('option', { value: m })));
  const base = h('input', { value: c.baseUrl, placeholder: 'default: https://api.anthropic.com' });
  const effort = h('select', {}, ...['', 'low', 'medium', 'high', 'xhigh', 'max'].map(v => h('option', { value: v, selected: c.effort === v }, v || 'model default')));
  const inline = h('input', { type: 'checkbox', checked: c.inline });
  const inlineModel = h('input', { value: c.inlineModel, placeholder: 'same as chat model', list: 'ai-models' });
  const syncPlaceholders = () => {
    const oa = provider.value === 'openai';
    base.placeholder = oa ? 'e.g. http://localhost:11434/v1 (Ollama)' : 'default: https://api.anthropic.com';
    key.placeholder = oa ? '(optional for local servers)' : 'sk-ant-…';
  };
  provider.addEventListener('change', syncPlaceholders); syncPlaceholders();
  const form = h('div', { class: 'form' },
    h('label', { class: 'f' }, h('span', {}, 'Provider'), provider),
    h('label', { class: 'f' }, h('span', {}, 'API key'), key,
      h('span', { class: 'hint' }, 'Stored only in this browser (localStorage) and sent only to the provider URL. Do not use on shared computers.')),
    h('label', { class: 'f' }, h('span', {}, 'Chat model'), model, models),
    h('label', { class: 'f' }, h('span', {}, 'Base URL'), base),
    h('label', { class: 'f' }, h('span', {}, 'Effort (Claude)'), effort),
    h('fieldset', {}, h('legend', {}, 'Inline completions'),
      h('label', { class: 'row' }, inline, h('span', {}, 'Show AI ghost-text suggestions while typing (Tab to accept). Uses API credits.')),
      h('label', { class: 'f' }, h('span', {}, 'Completion model'), inlineModel)));
  return {
    form,
    read: () => ({ provider: provider.value, apiKey: key.value.trim(), model: model.value.trim() || AI_DEFAULTS.model, baseUrl: base.value.trim(), effort: effort.value, inline: inline.checked, inlineModel: inlineModel.value.trim() }),
  };
}
