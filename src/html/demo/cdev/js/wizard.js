// "New project" wizard: creates the folder, starter files and an exec_settings.json
// with relative or absolute tool paths.
import { h, modal, toast, P, NP } from './util.js';
import { templateFiles } from './templates.js';
import { pickPath } from './picker.js';

function resolveAbs(base, rel) {
  if (NP.isAbs(rel)) return rel.replace(/\\/g, '/');
  const parts = NP.split(base);
  for (const p of NP.split(rel)) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return (base.startsWith('/') ? '/' : '') + parts.join('/');
}

export function openWizard({ app, defaults, parentDir = '' }) {
  const langs = Object.entries(defaults.languages || {}).filter(([k]) => k !== 'batch');
  const rootAbs = app.runner.connected ? app.runner.info.root.replace(/\\/g, '/') : null;
  const isWin = app.runner.connected ? app.runner.info.platform === 'windows' : /Win/.test(navigator.platform);

  const name = h('input', { value: 'my-app', autofocus: true });
  const parent = h('input', { value: parentDir, placeholder: '(workspace root)' });
  const lang = h('select', {}, ...langs.map(([k, v]) => h('option', { value: k }, v.label || k)));
  const modeRel = h('input', { type: 'radio', name: 'pm', value: 'relative', checked: true });
  const modeAbs = h('input', { type: 'radio', name: 'pm', value: 'absolute' });
  const toolsDir = h('input', { placeholder: 'e.g. ../tools  or  E:/portable/tools  (optional)' });
  const venv = h('input', { type: 'checkbox', checked: true });
  const venvRow = h('label', { class: 'row' }, venv, h('span', {}, 'Create a Python virtual environment (.venv) inside the project and use it'));
  const toolsBox = h('div', { class: 'form' });
  const preview = h('pre', { class: 'cmdline', style: { maxHeight: '220px', overflow: 'auto' } });
  const toolInputs = {};

  const absOk = app.runner.connected;
  const browseBtn = (onPick, tip) => h('button', {
    class: 'mini', type: 'button', disabled: !absOk && tip !== 'workspace',
    title: absOk || tip === 'workspace' ? 'Browse…' : 'Connect the local runner to browse your disk',
    onclick: onPick,
  }, '📂 Browse…');
  const parentBrowse = browseBtn(async () => {
    const r = await pickPath({ app, scope: 'workspace', select: 'dir', start: parent.value, title: '📁 Create the project inside…' });
    if (r != null) { parent.value = r; renderPreview(); }
  }, 'workspace');
  const toolsDirBrowse = browseBtn(async () => {
    const start = toolsDir.value.trim() ? (projectAbs() ? resolveAbs(projectAbs(), toolsDir.value.trim()) : toolsDir.value.trim()) : (rootAbs || '');
    const r = await pickPath({ app, scope: 'abs', select: 'dir', start, title: '🧰 Choose the tools folder' });
    if (r != null) { toolsDir.value = r.replace(/\\/g, '/'); renderPreview(); }
  });
  // where tool file browsing starts: tools folder if set, else the workspace
  const toolStart = () => (toolsDir.value.trim() && projectAbs() ? resolveAbs(projectAbs(), toolsDir.value.trim()) : (rootAbs || ''));

  const projectRel = () => P.join(parent.value, name.value.trim());
  const projectAbs = () => (rootAbs ? resolveAbs(rootAbs, projectRel()) : null);
  const mode = () => (modeAbs.checked ? 'absolute' : 'relative');

  function convert(value) {
    if (!value) return value;
    const abs = projectAbs();
    const looksPath = /[\\/]/.test(value) || value.startsWith('.');
    if (!looksPath || !abs) return value;
    if (mode() === 'relative' && NP.isAbs(value)) return NP.relative(abs, value) ?? value.replace(/\\/g, '/');
    if (mode() === 'absolute' && !NP.isAbs(value)) return resolveAbs(abs, value);
    return value.replace(/\\/g, '/');
  }

  function buildSettings() {
    const key = lang.value;
    const def = defaults.languages[key];
    const tools = {};
    for (const t of def.tools || []) {
      const v = toolInputs[t]?.value.trim();
      if (v) tools[t] = convert(v);
    }
    if (key === 'python' && venv.checked) {
      tools.pythonBase = tools.python || 'python';
      tools.python = { windows: '.venv/Scripts/python.exe', default: '.venv/bin/python' };
    }
    const s = {
      $schema: new URL('schema/exec_settings.schema.json', location.href).href,
      version: 1,
      pathMode: mode(),
    };
    if (toolsDir.value.trim()) s.toolsDir = convert(toolsDir.value.trim());
    s.tools = tools;
    const { tools: _t, ...langCopy } = def;
    s.languages = { [key]: langCopy };
    return s;
  }

  function renderPreview() { preview.textContent = JSON.stringify(buildSettings(), null, 2); }

  function renderTools() {
    const key = lang.value;
    const def = defaults.languages[key];
    toolsBox.innerHTML = '';
    venvRow.style.display = key === 'python' ? '' : 'none';
    const list = def.tools || [];
    if (!list.length) toolsBox.append(h('div', { class: 'hint' }, def.preview ? 'Runs in the browser preview — no tools needed.' : 'No tools needed.'));
    for (const t of list) {
      const dv = defaults.tools?.[t];
      const def0 = typeof dv === 'object' ? (dv[isWin ? 'windows' : 'default'] ?? dv.default) : dv;
      const input = toolInputs[t] && toolInputs[t].dataset.lang === key ? toolInputs[t] : h('input', { value: def0 || t, 'data-lang': key, oninput: renderPreview });
      toolInputs[t] = input;
      const sel = h('select', { style: { display: 'none' }, onchange: () => { input.value = sel.value; renderPreview(); } });
      const btn = h('button', { class: 'mini', type: 'button', disabled: !app.runner.connected, title: app.runner.connected ? 'Search PATH and the tools folder' : 'Connect the runner to detect tools' }, '🔍 Detect');
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '…';
        try {
          const search = toolsDir.value.trim() && projectAbs() ? [resolveAbs(projectAbs(), toolsDir.value.trim())] : [];
          const r = await app.runner.post('/api/detect', { tools: [t], dir: '', searchDirs: search });
          const info = r.tools[t];
          const opts = [...new Set([...(info.candidates || []), info.path].filter(Boolean))];
          sel.innerHTML = '';
          if (!opts.length) toast(`${t} not found in PATH${search.length ? ' or tools folder' : ''}`, 'warn');
          for (const o of opts) sel.append(h('option', { value: o }, o));
          sel.style.display = opts.length ? '' : 'none';
          if (opts.length) { input.value = opts[0]; renderPreview(); }
        } catch (e) { toast(e.message, 'error'); }
        btn.disabled = false; btn.textContent = '🔍 Detect';
      };
      const browse = browseBtn(async () => {
        const v = input.value.trim();
        const start = NP.isAbs(v) ? v.replace(/[\\/][^\\/]*$/, '') : toolStart();
        const r = await pickPath({ app, scope: 'abs', select: 'file', start, title: `📄 Choose the ${t} executable` });
        if (r != null) { input.value = r.replace(/\\/g, '/'); renderPreview(); }
      });
      browse.textContent = '📂';
      toolsBox.append(h('div', { class: 'tool-row' }, h('code', {}, t), input, h('div', { class: 'row' }, browse, btn)), h('div', { style: { gridColumn: '1/-1' } }, sel));
    }
    renderPreview();
  }

  for (const el of [name, parent, toolsDir]) el.addEventListener('input', renderPreview);
  for (const el of [modeRel, modeAbs, venv]) el.addEventListener('change', renderPreview);
  lang.addEventListener('change', renderTools);

  const body = h('div', { class: 'form' },
    h('div', { class: 'row' },
      h('label', { class: 'f', style: { flex: 1 } }, h('span', {}, 'Project name'), name),
      h('label', { class: 'f', style: { flex: 1 } }, h('span', {}, 'Language'), lang)),
    h('div', { class: 'f' }, h('label', { class: 'f' }, h('span', {}, 'Create inside folder')), h('div', { class: 'row' }, parent, parentBrowse),
      h('span', { class: 'hint' }, `Workspace: ${app.fs.name}${rootAbs ? ' — ' + rootAbs : ''}. To create projects elsewhere on the disk, change the workspace with 📂 Open folder.`)),
    h('fieldset', {}, h('legend', {}, 'Tool paths in exec_settings.json'),
      h('div', { class: 'radio' },
        h('label', {}, modeRel, 'Relative to the project (portable drive)'),
        h('label', {}, modeAbs, 'Absolute')),
      h('div', { class: 'f' }, h('label', { class: 'f' }, h('span', {}, 'Tools folder')), h('div', { class: 'row' }, toolsDir, toolsDirBrowse),
        h('span', { class: 'hint' }, 'Where portable compilers live (e.g. on the same USB drive). Used for detection and available as ${toolsDir} in commands.')),
      venvRow,
      toolsBox),
    h('details', {}, h('summary', {}, 'exec_settings.json preview'), preview));

  renderTools();

  modal({
    title: '✨ New project', body, size: 'wide',
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Create project', primary: true,
        onClick: async () => {
          const nm = name.value.trim();
          if (!nm || /[\\/:*?"<>|]/.test(nm)) { toast('Enter a valid project name', 'error'); return false; }
          const dir = projectRel();
          try {
            if (await app.fs.exists(dir)) { toast(`Folder "${dir}" already exists`, 'error'); return false; }
            const key = lang.value;
            const settings = buildSettings();
            const tpl = templateFiles(key, nm);
            await app.fs.mkdir(dir);
            await app.fs.write(P.join(dir, 'exec_settings.json'), JSON.stringify(settings, null, 2) + '\n');
            for (const [rel, content] of Object.entries(tpl.files)) await app.fs.write(P.join(dir, rel), content);
            if (tpl.gitignore) await app.fs.write(P.join(dir, '.gitignore'), tpl.gitignore);
            await app.fs.write(P.join(dir, 'README.md'),
              `# ${nm}\n\nCreated with CDev (${defaults.languages[key].label || key}).\n\n` +
              `- Run: open \`${tpl.main || ''}\` and press **F5**\n- Commands and tool paths: \`exec_settings.json\` (${mode()} paths)\n`);
            await app.afterProjectCreated(dir, tpl.main ? P.join(dir, tpl.main) : null, key === 'python' && venv.checked);
            toast(`Project "${nm}" created`, 'ok');
          } catch (e) {
            toast('Could not create project: ' + e.message, 'error');
            return false;
          }
        },
      },
    ],
  });
}
