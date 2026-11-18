// "Download runner": explains what the runner does, asks for explicit consent,
// then packages the runner files (served next to index.html) into a ZIP.
import { h, modal, toast, store } from './util.js';
import { makeZip } from './zip.js';

const CONSENT_VERSION = 1;
const ZIP_ROOT = 'CDev-runner/';
const FILES = [
  { src: 'runner/cdev_runner.py' },
  { src: 'runner/pycheck.py' },
  { src: 'runner/vendor_monaco.py' },
  { src: 'runner/runner_config.example.json' },
  { src: 'defaults/exec_settings.default.json' },
];

// Launchers are generated here, so the site does not need to host .bat/.sh files.
const LAUNCHERS = [
  {
    name: 'start_cdev.bat', crlf: true, data: `@echo off
rem CDev runner launcher (Windows). Uses a portable Python in tools\\python if present.
setlocal
cd /d "%~dp0"
set "PY="
if exist "tools\\python\\python.exe" set "PY=tools\\python\\python.exe"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo Python 3 was not found. Install it from https://www.python.org or put a portable Python in tools\\python\\
  pause
  exit /b 1
)
if "%~1"=="" (
  %PY% runner\\cdev_runner.py --open
) else (
  %PY% runner\\cdev_runner.py --root "%~1" --open
)
pause
`,
  },
  {
    name: 'start_cdev.sh', mode: 0o755, data: `#!/usr/bin/env sh
# CDev runner launcher (Linux / macOS). Usage: ./start_cdev.sh [workspace-folder]
cd "$(dirname "$0")" || exit 1
PY="python3"
[ -x "tools/python/bin/python3" ] && PY="tools/python/bin/python3"
command -v "$PY" >/dev/null 2>&1 || PY="python"
if [ -n "$1" ]; then
  exec "$PY" runner/cdev_runner.py --root "$1" --open
else
  exec "$PY" runner/cdev_runner.py --open
fi
`,
  },
];

const TEXT = {
  el: {
    title: '⬇ Λήψη CDev Runner',
    intro: 'Ο CDev Runner είναι ένα μικρό πρόγραμμα (Python) που τρέχει στον υπολογιστή σας και επιτρέπει σε αυτή τη σελίδα να μεταγλωττίζει και να εκτελεί τον κώδικά σας με τα δικά σας εργαλεία (gcc, Python, Java κ.λπ.). Διαβάστε προσεκτικά τι κάνει πριν τον κατεβάσετε.',
    canTitle: 'Όσο τρέχει και η σελίδα είναι συνδεδεμένη, ο runner μπορεί να:',
    can: [
      'διαβάζει, δημιουργεί, τροποποιεί και διαγράφει αρχεία και φακέλους μέσα στον φάκελο εργασίας (workspace) που επιλέγετε·',
      'εκτελεί εντολές στον υπολογιστή σας με τα δικαιώματα του χρήστη σας: compilers, interpreters, τις εντολές του exec_settings.json και ό,τι πληκτρολογείτε στην κονσόλα·',
      'εμφανίζει τη λίστα φακέλων και αρχείων του δίσκου σας για το παράθυρο «Browse» και αλλάζει φάκελο εργασίας όταν το ζητήσετε·',
      'αναζητά πού είναι εγκατεστημένα εργαλεία (gcc, python, java…) για τον οδηγό «New project».',
    ],
    notTitle: 'Ο runner ΔΕΝ:',
    not: [
      'στέλνει δεδομένα στο internet — ακούει μόνο τοπικά στη διεύθυνση 127.0.0.1 του υπολογιστή σας·',
      'εγκαθίσταται, ξεκινά αυτόματα ή τρέχει στο παρασκήνιο — λειτουργεί μόνο όσο είναι ανοιχτό το παράθυρό του (κλείσιμο ή Ctrl+C για τερματισμό)·',
      'αλλάζει ρυθμίσεις του συστήματος.',
    ],
    secTitle: 'Ασφάλεια',
    sec: [
      'Σε κάθε εκκίνηση δημιουργεί ένα μυστικό token· μόνο σελίδες που το έχουν (και επιτρεπόμενες διευθύνσεις: αυτή η σελίδα, *.github.io, localhost) μπορούν να του δώσουν εντολές.',
      'Όποιος έχει το token μπορεί να εκτελέσει εντολές στον υπολογιστή σας — μην το μοιράζεστε.',
      'Ο runner εκτελεί ό,τι του ζητήσετε. Κώδικας από άγνωστη πηγή μπορεί να βλάψει τον υπολογιστή σας ή τα δεδομένα σας.',
    ],
    reqTitle: 'Απαιτήσεις & περιεχόμενο',
    req: 'Χρειάζεται Python 3.8 ή νεότερη (ή portable Python στον φάκελο tools/python). Το ZIP περιέχει τον πηγαίο κώδικα του runner, ώστε να μπορείτε να τον ελέγξετε, και τα αρχεία εκκίνησης:',
    disclaimer: 'Το λογισμικό παρέχεται «ως έχει», χωρίς καμία εγγύηση. Είστε υπεύθυνοι για τον κώδικα και τις εντολές που εκτελείτε μέσω του runner.',
    agree: 'Διάβασα και κατανοώ τι κάνει ο CDev Runner και αποδέχομαι να τον κατεβάσω και να τον εκτελέσω με δική μου ευθύνη.',
    cancel: 'Άκυρο',
    download: '⬇ Λήψη ZIP',
    doneTitle: '✅ Ο runner κατέβηκε',
    steps: [
      'Αποσυμπιέστε το CDev-runner.zip σε όποιον φάκελο θέλετε (π.χ. στον USB δίσκο σας).',
      'Windows: διπλό κλικ στο start_cdev.bat · Linux/macOS: ./start_cdev.sh',
      'Ανοίγει αυτόματα αυτή η σελίδα συνδεδεμένη με τον runner. Τα projects σας αποθηκεύονται στον φάκελο workspace (αλλάζει από το 📂 Open folder).',
      'Αν δεν συνδεθεί αυτόματα: 🔌 Runner → επικολλήστε το token που εμφανίζεται στο παράθυρο του runner.',
    ],
    smart: 'Τα Windows μπορεί να εμφανίσουν προειδοποίηση για αρχείο από το internet — είναι αναμενόμενο για αρχεία .bat.',
    close: 'Κλείσιμο',
  },
  en: {
    title: '⬇ Download CDev Runner',
    intro: 'The CDev Runner is a small program (Python) that runs on your computer and lets this page compile and run your code with your own tools (gcc, Python, Java, …). Please read what it does before downloading it.',
    canTitle: 'While it is running and this page is connected, the runner can:',
    can: [
      'read, create, modify and delete files and folders inside the workspace folder you choose;',
      'run commands on your computer with your user\'s permissions: compilers, interpreters, the commands in exec_settings.json and anything you type in the console;',
      'list folders and files on your disk for the “Browse” dialog and switch the workspace when you ask;',
      'look up where tools (gcc, python, java…) are installed for the “New project” wizard.',
    ],
    notTitle: 'The runner does NOT:',
    not: [
      'send data to the internet — it only listens locally on 127.0.0.1;',
      'install itself, start automatically or run in the background — it works only while its window is open (close it or press Ctrl+C to stop);',
      'change system settings.',
    ],
    secTitle: 'Security',
    sec: [
      'Each start creates a secret token; only pages that have it (from allowed addresses: this site, *.github.io, localhost) can send it commands.',
      'Anyone with the token can run commands on your computer — do not share it.',
      'The runner executes what you ask it to. Code from untrusted sources can harm your computer or data.',
    ],
    reqTitle: 'Requirements & contents',
    req: 'Requires Python 3.8 or newer (or a portable Python in tools/python). The ZIP contains the runner\'s source code, so you can review it, plus the start scripts:',
    disclaimer: 'The software is provided “as is”, without warranty of any kind. You are responsible for the code and commands you run through the runner.',
    agree: 'I have read and understand what the CDev Runner does, and I agree to download and run it at my own risk.',
    cancel: 'Cancel',
    download: '⬇ Download ZIP',
    doneTitle: '✅ Runner downloaded',
    steps: [
      'Unzip CDev-runner.zip anywhere you like (e.g. on your USB drive).',
      'Windows: double-click start_cdev.bat · Linux/macOS: ./start_cdev.sh',
      'This page opens automatically, connected to the runner. Projects are stored in the workspace folder (change it with 📂 Open folder).',
      'If it does not connect automatically: 🔌 Runner → paste the token shown in the runner window.',
    ],
    smart: 'Windows may warn about a file downloaded from the internet — this is expected for .bat files.',
    close: 'Close',
  },
};

function pageUrl() {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

export async function buildZip() {
  const files = [];
  for (const f of FILES) {
    const r = await fetch(f.src, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Missing ${f.src} on the server (HTTP ${r.status})`);
    let text = await r.text();
    text = text.replace(/\r\n/g, '\n');
    if (f.crlf) text = text.replace(/\n/g, '\r\n');
    files.push({ name: ZIP_ROOT + f.src, data: text, mode: f.mode });
  }
  for (const l of LAUNCHERS) {
    files.push({ name: ZIP_ROOT + l.name, data: l.crlf ? l.data.replace(/\n/g, '\r\n') : l.data, mode: l.mode });
  }
  const config = { root: 'workspace', port: 8787, token: null, allowOrigins: [], serveUi: true };
  if (location.protocol === 'https:') config.uiUrl = pageUrl();
  files.push({ name: ZIP_ROOT + 'runner/runner_config.json', data: JSON.stringify(config, null, 2) + '\n' });
  files.push({
    name: ZIP_ROOT + 'README.txt',
    data: [
      'CDev Runner',
      '===========',
      '',
      'Windows : double-click start_cdev.bat',
      'Linux/macOS : ./start_cdev.sh   (or: python3 runner/cdev_runner.py --open)',
      '',
      'Requires Python 3.8+. Projects are kept in the "workspace" folder.',
      'Settings: runner/runner_config.json (root, port, fixed token, uiUrl).',
      config.uiUrl ? `Editor: ${config.uiUrl}` : '',
      '',
      'Stop the runner by closing its window or pressing Ctrl+C.',
      '',
      '© 2026 Ioannis A. Kavouras. All rights reserved.',
      '',
    ].join('\r\n'),
  });
  return makeZip(files);
}

export function openRunnerDownload() {
  let lang = (navigator.language || '').toLowerCase().startsWith('el') ? 'el' : 'en';
  const host = h('div');
  const prev = store.get('runnerConsent', null);

  function render() {
    const T = TEXT[lang];
    const agree = h('input', { type: 'checkbox', id: 'runner-consent' });
    const dl = h('button', { class: 'btn primary', disabled: true }, T.download);
    const cancel = h('button', { class: 'btn' }, T.cancel);
    agree.addEventListener('change', () => { dl.disabled = !agree.checked; });
    const list = items => h('ul', { class: 'consent-list' }, ...items.map(i => h('li', {}, i)));
    host.innerHTML = '';
    host.append(
      h('div', { class: 'consent-lang' },
        h('button', { class: `mini ${lang === 'el' ? 'primary' : ''}`, onclick: () => { lang = 'el'; render(); dlg.setTitle(TEXT.el.title); } }, 'Ελληνικά'),
        h('button', { class: `mini ${lang === 'en' ? 'primary' : ''}`, onclick: () => { lang = 'en'; render(); dlg.setTitle(TEXT.en.title); } }, 'English')),
      h('div', { class: 'consent-text' },
        h('p', {}, T.intro),
        h('h4', {}, T.canTitle), list(T.can),
        h('h4', {}, T.notTitle), list(T.not),
        h('h4', {}, T.secTitle), list(T.sec),
        h('h4', {}, T.reqTitle), h('p', {}, T.req),
        h('pre', { class: 'cmdline' }, ['CDev-runner/', ...LAUNCHERS.map(l => '  ' + l.name), ...FILES.map(f => '  ' + f.src), '  runner/runner_config.json', '  README.txt'].join('\n')),
        h('p', { class: 'consent-disclaimer' }, T.disclaimer),
        prev ? h('p', { class: 'hint' }, (lang === 'el' ? 'Τελευταία αποδοχή: ' : 'Last accepted: ') + new Date(prev.at).toLocaleString()) : null),
      h('label', { class: 'consent-agree', for: 'runner-consent' }, agree, h('span', {}, T.agree)),
      h('div', { class: 'consent-actions' }, cancel, dl));
    cancel.onclick = () => dlg.close();
    dl.onclick = async () => {
      if (!agree.checked) return;
      dl.disabled = true; dl.textContent = '…';
      try {
        const blob = await buildZip();
        store.set('runnerConsent', { at: new Date().toISOString(), version: CONSENT_VERSION, lang });
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: 'CDev-runner.zip' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        dlg.close();
        showNextSteps(lang);
      } catch (e) {
        toast(e.message, 'error', 8000);
        dl.disabled = false; dl.textContent = T.download;
      }
    };
  }

  const dlg = modal({ title: TEXT[lang].title, body: host, size: 'wide' });
  dlg.setTitle = t => { const el = dlg.el.querySelector('.modal-head'); if (el) el.firstChild.textContent = t; };
  render();
}

function showNextSteps(lang) {
  const T = TEXT[lang];
  modal({
    title: T.doneTitle,
    body: h('div', {}, h('ol', { class: 'consent-list' }, ...T.steps.map(s => h('li', {}, s))), h('p', { class: 'hint' }, T.smart)),
    buttons: [{ label: T.close, primary: true }],
  });
}
