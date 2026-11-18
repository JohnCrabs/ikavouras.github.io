// Console panel: process output (with basic ANSI colors + clickable file:line links), stdin and shell commands.
import { Emitter, h, store } from './util.js';

const ANSI_COLORS = ['#000', '#e5534b', '#57ab5a', '#c69026', '#539bf5', '#b083f0', '#39c5cf', '#d7dae0'];
const ANSI_BRIGHT = ['#636e7b', '#ff938a', '#6bc46d', '#daaa3f', '#6cb6ff', '#dcbdfb', '#56d4dd', '#fff'];
const LINK_RE = /((?:[A-Za-z]:[\\/][^:*?"<>|\n]*?|[\w.\-\\/]*)[\w\-]+\.[A-Za-z0-9+]{1,6}):(\d+)(?::(\d+))?|File "([^"]+)", line (\d+)/g;
const MAX_CHARS = 400000;

export class ConsoleView extends Emitter {
  constructor(out, form, input, prompt) {
    super();
    this.out = out; this.form = form; this.input = input; this.prompt = prompt;
    this.history = store.get('shellHistory', []);
    this.hIdx = -1;
    this.mode = 'shell';
    this.style = {};
    this.chars = 0;
    form.addEventListener('submit', e => { e.preventDefault(); this._submit(); });
    input.addEventListener('keydown', e => this._key(e));
    out.addEventListener('click', e => {
      const a = e.target.closest('a.flink');
      if (a) this.emit('link', { file: a.dataset.file, line: +a.dataset.line, col: +a.dataset.col || 1 });
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.prompt.textContent = mode === 'stdin' ? '›' : '$';
    this.prompt.classList.toggle('stdin', mode === 'stdin');
    this.input.placeholder = mode === 'stdin'
      ? 'Program input — press Enter to send (Ctrl+D = end of input)'
      : (this.shellEnabled ? 'Type a shell command (runs in the project folder)…' : 'Connect the local runner to run shell commands');
  }

  clear() { this.out.innerHTML = ''; this.chars = 0; this.style = {}; }

  write(text, cls = '') {
    if (!text) return;
    const atBottom = this.out.scrollHeight - this.out.scrollTop - this.out.clientHeight < 40;
    const frag = document.createDocumentFragment();
    // split on ANSI SGR sequences
    const parts = String(text).replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;?]*[ABCDEFGHJKSTfhlnsu]/g, '').split(/\x1b\[([0-9;]*)m/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) { this._sgr(parts[i]); continue; }
      if (!parts[i]) continue;
      frag.append(this._linkify(parts[i], cls));
    }
    this.out.append(frag);
    this.chars += text.length;
    if (this.chars > MAX_CHARS) this._trim();
    if (atBottom) this.out.scrollTop = this.out.scrollHeight;
  }

  line(text, cls = 'info') { this.write(text.endsWith('\n') ? text : text + '\n', cls); }

  _trim() {
    while (this.chars > MAX_CHARS * 0.7 && this.out.firstChild) {
      this.chars -= (this.out.firstChild.textContent || '').length;
      this.out.firstChild.remove();
    }
  }

  _sgr(codes) {
    const list = (codes || '0').split(';').map(Number);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === 0) this.style = {};
      else if (c === 1) this.style.bold = true;
      else if (c === 22) this.style.bold = false;
      else if (c >= 30 && c <= 37) this.style.color = ANSI_COLORS[c - 30];
      else if (c >= 90 && c <= 97) this.style.color = ANSI_BRIGHT[c - 90];
      else if (c === 39) delete this.style.color;
      else if (c === 38 && list[i + 1] === 5) i += 2;
      else if (c === 38 && list[i + 1] === 2) { this.style.color = `rgb(${list[i + 2]},${list[i + 3]},${list[i + 4]})`; i += 4; }
    }
  }

  _linkify(text, cls) {
    const span = h('span', { class: cls });
    if (this.style.color) span.style.color = this.style.color;
    if (this.style.bold) span.style.fontWeight = '700';
    let last = 0;
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(text))) {
      const file = (m[1] || m[4] || '').trim();
      const line = m[2] || m[5];
      if (!file || /^https?$/i.test(file) || /^\d+$/.test(file)) continue;
      span.append(text.slice(last, m.index));
      const a = h('a', { class: 'flink', 'data-file': file, 'data-line': line, 'data-col': m[3] || 1 }, m[0]);
      span.append(a);
      last = m.index + m[0].length;
    }
    span.append(text.slice(last));
    return span;
  }

  _submit() {
    const val = this.input.value;
    if (this.mode === 'stdin') {
      this.write(val + '\n', 'in');
      this.emit('stdin', val + '\n');
    } else {
      if (!val.trim()) return;
      this.history = [val, ...this.history.filter(x => x !== val)].slice(0, 100);
      store.set('shellHistory', this.history);
      this.emit('shell', val);
    }
    this.hIdx = -1;
    this.input.value = '';
  }

  _key(e) {
    if (e.key === 'd' && e.ctrlKey && this.mode === 'stdin') {
      e.preventDefault();
      if (this.input.value) this._submit();
      this.write('^D\n', 'info');
      this.emit('eof');
    } else if (e.key === 'c' && e.ctrlKey && this.mode === 'stdin' && this.input.selectionStart === this.input.selectionEnd) {
      this.emit('interrupt');
    } else if (this.mode === 'shell' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.hIdx = Math.max(-1, Math.min(this.history.length - 1, this.hIdx + (e.key === 'ArrowUp' ? 1 : -1)));
      this.input.value = this.hIdx >= 0 ? this.history[this.hIdx] : '';
    }
  }
}
