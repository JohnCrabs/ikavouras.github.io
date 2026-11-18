// File-system backends with one interface:
//   list(dir) -> [{name, type:'file'|'dir'}], read(path) -> string, readBlob(path) -> Blob,
//   write(path, text), mkdir(path), remove(path), rename(from, to), exists(path) -> 'file'|'dir'|null
// Paths are workspace-relative and use '/'.
import { P, store } from './util.js';

// ---------- via the local runner ----------
export class RunnerFS {
  constructor(runner) {
    this.runner = runner;
    this.kind = 'runner';
    this.name = runner.info?.rootName || 'workspace';
    this.canRun = true;
  }
  async list(dir) { return (await this.runner.get('/api/fs/list', { path: dir || '' })).entries; }
  async read(path) {
    const r = await this.runner.get('/api/fs/read', { path });
    if (r.binary) throw Object.assign(new Error('Binary file'), { binary: true });
    return r.content;
  }
  readBlob(path) { return this.runner.blob('/api/fs/raw', { path }); }
  write(path, content) { return this.runner.post('/api/fs/write', { path, content }); }
  mkdir(path) { return this.runner.post('/api/fs/mkdir', { path }); }
  remove(path) { return this.runner.post('/api/fs/delete', { path }); }
  rename(from, to) { return this.runner.post('/api/fs/rename', { from, to }); }
  async exists(path) { return (await this.runner.get('/api/fs/exists', { path })).type; }
}

// ---------- via the browser File System Access API (Chrome / Edge) ----------
export class BrowserFS {
  constructor(handle) {
    this.root = handle;
    this.kind = 'browser';
    this.name = handle.name;
    this.canRun = false;
  }
  static supported() { return 'showDirectoryPicker' in window; }
  async _dir(path, create = false) {
    let d = this.root;
    for (const part of P.norm(path).split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
    return d;
  }
  async _file(path, create = false) {
    const dir = await this._dir(P.dirname(path), create);
    return dir.getFileHandle(P.basename(path), { create });
  }
  async list(dir) {
    const d = await this._dir(dir);
    const out = [];
    for await (const [name, hnd] of d.entries()) {
      if (name === '.git' || name === '__pycache__') continue;
      out.push({ name, type: hnd.kind === 'directory' ? 'dir' : 'file' });
    }
    return out.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  }
  async read(path) {
    const f = await (await this._file(path)).getFile();
    const buf = new Uint8Array(await f.slice(0, 8000).arrayBuffer());
    if (buf.includes(0)) throw Object.assign(new Error('Binary file'), { binary: true });
    return f.text();
  }
  async readBlob(path) { return (await this._file(path)).getFile(); }
  async write(path, content) {
    const fh = await this._file(path, true);
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }
  async mkdir(path) { await this._dir(path, true); }
  async remove(path) {
    const parent = await this._dir(P.dirname(path));
    await parent.removeEntry(P.basename(path), { recursive: true });
  }
  async exists(path) {
    if (!P.norm(path)) return 'dir';
    try {
      const parent = await this._dir(P.dirname(path));
      try { await parent.getFileHandle(P.basename(path)); return 'file'; } catch { /* not a file */ }
      try { await parent.getDirectoryHandle(P.basename(path)); return 'dir'; } catch { /* not a dir */ }
    } catch { /* parent missing */ }
    return null;
  }
  async rename(from, to) {
    if (await this.exists(to)) throw new Error('Target already exists');
    const type = await this.exists(from);
    if (type === 'file') {
      await this.write(to, await (await this._file(from)).getFile());
    } else if (type === 'dir') {
      const copy = async (src, dst) => {
        await this.mkdir(dst);
        for (const e of await this.list(src)) {
          if (e.type === 'dir') await copy(P.join(src, e.name), P.join(dst, e.name));
          else await this.write(P.join(dst, e.name), await (await this._file(P.join(src, e.name))).getFile());
        }
      };
      await copy(from, to);
    } else throw new Error('Source not found');
    await this.remove(from);
  }
  async verifyPermission() {
    const opts = { mode: 'readwrite' };
    if ((await this.root.queryPermission(opts)) === 'granted') return true;
    return (await this.root.requestPermission(opts)) === 'granted';
  }
}

// ---------- scratch workspace kept in localStorage ----------
export class MemoryFS {
  constructor() {
    this.kind = 'memory';
    this.name = 'Scratch (browser storage)';
    this.canRun = false;
    const data = store.get('memfs', null);
    this.files = data?.files || {};
    this.dirs = new Set(data?.dirs || []);
  }
  _save() { store.set('memfs', { files: this.files, dirs: [...this.dirs] }); }
  async list(dir) {
    dir = P.norm(dir);
    const seen = new Map();
    const pre = dir ? dir + '/' : '';
    const consider = (p, isDir) => {
      if (!p.startsWith(pre)) return;
      const rest = p.slice(pre.length);
      if (!rest) return;
      const [first, ...more] = rest.split('/');
      const type = more.length || isDir ? 'dir' : 'file';
      if (!seen.has(first) || type === 'dir') seen.set(first, type);
    };
    Object.keys(this.files).forEach(p => consider(p, false));
    this.dirs.forEach(p => consider(p, true));
    return [...seen].map(([name, type]) => ({ name, type }))
      .sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  }
  async read(path) {
    path = P.norm(path);
    if (!(path in this.files)) throw new Error('File not found: ' + path);
    return this.files[path];
  }
  async readBlob(path) { return new Blob([await this.read(path)]); }
  async write(path, content) {
    path = P.norm(path);
    if (content instanceof Blob) content = await content.text();
    this.files[path] = String(content);
    this._save();
  }
  async mkdir(path) { this.dirs.add(P.norm(path)); this._save(); }
  async remove(path) {
    path = P.norm(path);
    delete this.files[path];
    for (const k of Object.keys(this.files)) if (k.startsWith(path + '/')) delete this.files[k];
    for (const d of [...this.dirs]) if (d === path || d.startsWith(path + '/')) this.dirs.delete(d);
    this._save();
  }
  async exists(path) {
    path = P.norm(path);
    if (!path) return 'dir';
    if (path in this.files) return 'file';
    if (this.dirs.has(path) || Object.keys(this.files).some(k => k.startsWith(path + '/'))) return 'dir';
    return null;
  }
  async rename(from, to) {
    from = P.norm(from); to = P.norm(to);
    if (await this.exists(to)) throw new Error('Target already exists');
    for (const k of Object.keys(this.files)) {
      if (k === from || k.startsWith(from + '/')) { this.files[to + k.slice(from.length)] = this.files[k]; delete this.files[k]; }
    }
    for (const d of [...this.dirs]) {
      if (d === from || d.startsWith(from + '/')) { this.dirs.delete(d); this.dirs.add(to + d.slice(from.length)); }
    }
    this._save();
  }
}
