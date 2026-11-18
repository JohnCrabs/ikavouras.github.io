// File explorer tree (lazy loaded).
import { Emitter, h, P, store, toast } from './util.js';

const ICONS = {
  '.c': '🇨', '.h': '🅷', '.cpp': '➕', '.cc': '➕', '.hpp': '🅷', '.py': '🐍', '.java': '☕', '.rs': '🦀',
  '.js': '🟨', '.mjs': '🟨', '.ts': '🔷', '.html': '🌐', '.htm': '🌐', '.css': '🎨', '.json': '🧾', '.md': '📝',
  '.go': '🐹', '.cs': '#️⃣', '.php': '🐘', '.rb': '💎', '.lua': '🌙', '.sh': '🐚', '.bat': '🐚', '.txt': '📄',
  '.png': '🖼', '.jpg': '🖼', '.jpeg': '🖼', '.gif': '🖼', '.svg': '🖼', '.exe': '⚙', '.toml': '🧾', '.yml': '🧾', '.yaml': '🧾',
};
export const fileIcon = name => (name === 'exec_settings.json' ? '🛠' : ICONS[P.ext(name)] || '📄');

export class Tree extends Emitter {
  constructor(el) {
    super();
    this.el = el;
    this.fs = null;
    this.cache = new Map();
    this.expanded = new Set();
    this.selected = null;
    this.activePath = null;
    this.dirty = new Set();
    el.addEventListener('keydown', e => this._key(e));
    el.addEventListener('contextmenu', e => {
      if (e.target === el) { e.preventDefault(); this.emit('context', { path: '', type: 'dir', x: e.clientX, y: e.clientY }); }
    });
  }

  _storeKey() { return 'tree.' + (this.fs?.kind || '') + ':' + (this.fs?.name || ''); }

  async setFS(fs) {
    this.fs = fs;
    this.cache.clear();
    this.expanded = new Set(store.get(this._storeKey(), ['']));
    this.expanded.add('');
    await this.refresh();
  }

  async load(dir) {
    try {
      const entries = await this.fs.list(dir);
      this.cache.set(dir, entries);
    } catch (e) {
      this.cache.set(dir, []);
      this.expanded.delete(dir);
      if (dir === '') toast('Cannot list workspace: ' + e.message, 'error');
    }
  }

  async refresh(dir) {
    if (!this.fs) { this.render(); return; }
    const dirs = dir != null ? [dir] : [...this.expanded];
    await Promise.all(dirs.map(d => this.load(d)));
    this.render();
  }

  isProject(dir) { return (this.cache.get(dir) || []).some(e => e.name === 'exec_settings.json'); }

  async toggle(dir, force) {
    const open = force ?? !this.expanded.has(dir);
    if (open) { this.expanded.add(dir); if (!this.cache.has(dir)) await this.load(dir); }
    else this.expanded.delete(dir);
    store.set(this._storeKey(), [...this.expanded]);
    this.render();
  }

  async reveal(path) {
    const parts = P.dirname(path).split('/').filter(Boolean);
    let cur = '';
    for (const p of parts) { cur = P.join(cur, p); if (!this.expanded.has(cur)) { this.expanded.add(cur); await this.load(cur); } }
    this.selected = path;
    this.render();
    const node = this.el.querySelector(`[data-path="${CSS.escape(path)}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }

  setActive(path) { this.activePath = path; this.render(); }
  setDirty(set) { this.dirty = set; this.render(); }

  render() {
    const scroll = this.el.scrollTop;
    this.el.innerHTML = '';
    if (!this.fs) return;
    const root = this.cache.get('') || [];
    if (!root.length) {
      this.el.append(h('div', { class: 'tree-empty' }, 'This folder is empty.',
        h('br'), h('button', { class: 'mini', onclick: () => this.emit('newProject', '') }, '✨ New project')));
      return;
    }
    const frag = document.createDocumentFragment();
    const walk = (dir, depth) => {
      for (const e of this.cache.get(dir) || []) {
        const path = P.join(dir, e.name);
        const isDir = e.type === 'dir';
        const open = isDir && this.expanded.has(path);
        const cls = ['tnode'];
        if (this.selected === path) cls.push('selected');
        if (this.activePath === path) cls.push('active-file');
        if (this.dirty.has(path)) cls.push('dirty');
        if (isDir && this.isProject(path)) cls.push('project');
        const node = h('div', {
          class: cls.join(' '), 'data-path': path, title: path, style: { paddingLeft: 8 + depth * 14 + 'px' },
          onclick: () => { this.selected = path; if (isDir) this.toggle(path); else { this.render(); this.emit('open', path); } },
          oncontextmenu: ev => { ev.preventDefault(); ev.stopPropagation(); this.selected = path; this.render(); this.emit('context', { path, type: e.type, x: ev.clientX, y: ev.clientY }); },
        },
        h('span', { class: 'tw' }, isDir ? (open ? '▾' : '▸') : ''),
        h('span', { class: 'ti' }, isDir ? (this.isProject(path) ? '🧩' : open ? '📂' : '📁') : fileIcon(e.name)),
        h('span', { class: 'tn' }, e.name));
        frag.append(node);
        if (open) walk(path, depth + 1);
      }
    };
    walk('', 0);
    this.el.append(frag);
    this.el.scrollTop = scroll;
  }

  // the folder new files should go into
  targetDir() {
    const s = this.selected;
    if (s == null) return '';
    const entry = (this.cache.get(P.dirname(s)) || []).find(e => e.name === P.basename(s));
    return entry?.type === 'dir' ? s : P.dirname(s);
  }

  _key(e) {
    const nodes = [...this.el.querySelectorAll('.tnode')];
    const i = nodes.findIndex(n => n.dataset.path === this.selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = nodes[Math.max(0, Math.min(nodes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) { this.selected = n.dataset.path; this.render(); }
    } else if (e.key === 'Enter' && i >= 0) {
      nodes[i].click();
    } else if (e.key === 'Delete' && this.selected) {
      this.emit('delete', this.selected);
    } else if (e.key === 'F2' && this.selected) {
      this.emit('rename', this.selected);
    }
  }
}
