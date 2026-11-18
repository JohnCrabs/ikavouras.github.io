// Folder / file picker. A web page cannot get real paths from the OS dialog,
// so we browse through the runner (absolute paths) or the current workspace (relative paths).
import { h, modal, toast, P } from './util.js';

/**
 * @param {object} o
 * @param {object} o.app
 * @param {'workspace'|'abs'} o.scope  workspace: relative paths in the open workspace; abs: whole disk via runner
 * @param {'dir'|'file'} o.select
 * @param {string} [o.start]
 * @param {string} [o.title]
 * @returns {Promise<string|null>}
 */
export function pickPath({ app, scope = 'workspace', select = 'dir', start = '', title }) {
  return new Promise(resolve => {
    if (scope === 'abs' && !app.runner.connected) {
      toast('Connect the local runner to browse your disk.', 'warn');
      resolve(null);
      return;
    }
    let cur = null;          // current folder (rel or abs)
    let chosen = null;       // selected file (select=file)
    let result = null;
    const pathInput = h('input', { 'data-nosubmit': true, style: { flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' } });
    const list = h('div', { class: 'picker-list' });
    const places = h('div', { class: 'picker-places' });
    const status = h('div', { class: 'hint' });
    const upBtn = h('button', { class: 'mini', type: 'button', title: 'Up one level' }, '⬆');

    async function load(target) {
      list.innerHTML = '';
      list.append(h('div', { class: 'hint', style: { padding: '8px' } }, 'Loading…'));
      try {
        let entries, parent, shown;
        if (scope === 'abs') {
          const r = await app.runner.get('/api/abs/list', { path: target || '' });
          entries = r.entries; parent = r.parent; shown = r.path;
          if (!places.childElementCount) {
            for (const pl of r.places || []) places.append(h('button', { class: 'mini', type: 'button', onclick: () => load(pl.path) }, pl.name));
            if (r.sep === '\\') places.append(h('button', { class: 'mini', type: 'button', onclick: () => load('') }, 'This PC'));
          }
        } else {
          target = P.norm(target || '');
          entries = (await app.fs.list(target)).map(e => ({ ...e, path: P.join(target, e.name) }));
          parent = target ? P.dirname(target) : null;
          shown = target;
        }
        cur = shown; chosen = null;
        pathInput.value = scope === 'abs' ? shown : '/' + shown;
        upBtn.disabled = parent == null;
        upBtn.onclick = () => load(parent);
        list.innerHTML = '';
        const visible = entries.filter(e => select === 'file' || e.type === 'dir');
        if (!visible.length) list.append(h('div', { class: 'hint', style: { padding: '8px' } }, select === 'dir' ? 'No sub-folders.' : 'Empty folder.'));
        for (const e of visible) {
          const row = h('div', {
            class: 'picker-row', title: e.path,
            onclick: () => {
              if (e.type === 'dir') return load(e.path);
              chosen = e.path;
              list.querySelectorAll('.picker-row.sel').forEach(n => n.classList.remove('sel'));
              row.classList.add('sel');
              status.textContent = 'Selected: ' + e.path;
            },
            ondblclick: () => { if (e.type === 'file') { result = e.path; dlg.close(); } },
          }, h('span', {}, e.type === 'dir' ? '📁' : '📄'), h('span', {}, e.name));
          list.append(row);
        }
        status.textContent = select === 'dir' ? 'Open a folder, then press “Select this folder”.' : 'Click a file to select it (double-click to choose).';
      } catch (e) {
        list.innerHTML = '';
        list.append(h('div', { class: 'hint', style: { padding: '8px', color: 'var(--err)' } }, e.message));
      }
    }

    pathInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); load(scope === 'abs' ? pathInput.value.trim() : pathInput.value.replace(/^\//, '')); }
    });

    const body = h('div', { class: 'form' },
      places,
      h('div', { class: 'row' }, upBtn, pathInput),
      list,
      status);
    const dlg = modal({
      title: title || (select === 'dir' ? '📁 Choose folder' : '📄 Choose file'), body, size: 'wide',
      buttons: [
        { label: 'Cancel' },
        {
          label: select === 'dir' ? 'Select this folder' : 'Select', primary: true,
          onClick: () => {
            if (select === 'dir') { if (cur == null || (scope === 'abs' && !cur)) { toast('Open a folder first', 'warn'); return false; } result = cur; }
            else { if (!chosen) { toast('Click a file first', 'warn'); return false; } result = chosen; }
          },
        },
      ],
      onClose: () => resolve(result),
    });
    load(start);
  });
}
