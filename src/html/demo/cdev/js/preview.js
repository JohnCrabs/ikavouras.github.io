// In-browser runtimes: live HTML preview, JavaScript sandbox and Python via Pyodide (no local tools needed).
import { P } from './util.js';

const BRIDGE = `<script>(function(){
var fmt=function(a){try{if(a instanceof Error)return a.stack||String(a);if(typeof a==='string')return a;if(a===undefined)return 'undefined';if(typeof a==='function')return a.toString();return JSON.stringify(a,null,1);}catch(e){return String(a);}};
var send=function(level,args){try{parent.postMessage({__cdev:1,level:level,text:Array.prototype.map.call(args,fmt).join(' ')},'*');}catch(e){}};
['log','info','warn','error','debug'].forEach(function(l){var o=console[l];console[l]=function(){send(l,arguments);o&&o.apply(console,arguments);};});
addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')]);});
addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection: '+fmt(e.reason)]);});
window.__cdevDone=function(){send('done',[]);};
})();<\/script>`;

const isLocalRef = u => u && !/^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(u);

export class Preview {
  constructor({ frame, label, readText, readBlob, onConsole }) {
    this.frame = frame; this.label = label;
    this.readText = readText; this.readBlob = readBlob; this.onConsole = onConsole;
    this.path = null;
    this.blobs = [];
    this.lastHtml = '';
    window.addEventListener('message', e => {
      if (e.source !== this.frame.contentWindow || !e.data || !e.data.__cdev) return;
      this.onConsole(e.data.level, e.data.text);
    });
  }

  _revoke() { this.blobs.forEach(u => URL.revokeObjectURL(u)); this.blobs = []; }

  async build(htmlPath) {
    const dir = P.dirname(htmlPath);
    const src = await this.readText(htmlPath);
    const doc = new DOMParser().parseFromString(src, 'text/html');
    this._revoke();
    for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
      const href = link.getAttribute('href');
      if (!isLocalRef(href)) continue;
      try {
        const css = await this.readText(P.join(dir, href.split(/[?#]/)[0]));
        const style = doc.createElement('style');
        style.textContent = css + `\n/*# sourceURL=${href} */`;
        link.replaceWith(style);
      } catch { /* missing file: leave the tag */ }
    }
    for (const s of [...doc.querySelectorAll('script[src]')]) {
      const href = s.getAttribute('src');
      if (!isLocalRef(href)) continue;
      try {
        const js = await this.readText(P.join(dir, href.split(/[?#]/)[0]));
        const ns = doc.createElement('script');
        for (const a of s.attributes) if (a.name !== 'src') ns.setAttribute(a.name, a.value);
        ns.textContent = js + `\n//# sourceURL=${href}`;
        s.replaceWith(ns);
      } catch { /* leave */ }
    }
    for (const el of [...doc.querySelectorAll('img[src], source[src], audio[src], video[src]')]) {
      const href = el.getAttribute('src');
      if (!isLocalRef(href)) continue;
      try {
        const url = URL.createObjectURL(await this.readBlob(P.join(dir, href)));
        this.blobs.push(url);
        el.setAttribute('src', url);
      } catch { /* leave */ }
    }
    return '<!doctype html>\n' + BRIDGE + doc.documentElement.outerHTML;
  }

  async show(htmlPath) {
    this.path = htmlPath;
    this.label.textContent = htmlPath;
    const html = await this.build(htmlPath);
    this.lastHtml = html;
    this.frame.srcdoc = html;
  }

  async refresh() { if (this.path) await this.show(this.path); }

  popOut() {
    if (!this.lastHtml) return;
    const url = URL.createObjectURL(new Blob([this.lastHtml], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
  }

  runJs(code, path) {
    this.path = null;
    this.label.textContent = `${path} (browser sandbox)`;
    const safe = code.replace(/<\/script/gi, '<\\/script');
    this.lastHtml = `<!doctype html>${BRIDGE}<body style="font-family:system-ui;color:#666;padding:12px">Running <code>${P.basename(path)}</code> in the browser sandbox… output goes to the Console.<script type="module">\n${safe}\n;window.__cdevDone();<\/script></body>`;
    this.frame.srcdoc = this.lastHtml;
  }
}

// ---------- Pyodide (Python compiled to WebAssembly) ----------
let pyodideP = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src)); document.head.append(s); });
}
export async function runPythonInBrowser(code, con) {
  if (!pyodideP) {
    con.line('Loading Python runtime (Pyodide) in the browser — first time downloads ~10 MB…');
    pyodideP = loadScript('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js').then(() => window.loadPyodide());
  }
  let py;
  try { py = await pyodideP; } catch (e) { pyodideP = null; con.write(e.message + '\n', 'err'); return 1; }
  py.setStdout({ batched: s => con.write(s + '\n') });
  py.setStderr({ batched: s => con.write(s + '\n', 'err') });
  py.setStdin({ stdin: () => { const v = window.prompt('Python input():'); if (v != null) con.write(v + '\n', 'in'); return v ?? ''; } });
  try {
    await py.loadPackagesFromImports(code);
    await py.runPythonAsync(code);
    return 0;
  } catch (e) {
    con.write(String(e.message || e) + '\n', 'err');
    return 1;
  }
}
