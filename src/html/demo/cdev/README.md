# CDev — ελαφρύς online editor με τοπική εκτέλεση

CDev είναι ένας **στατικός** web editor (τρέχει σε GitHub Pages) για C/C++, Python, Java, Rust, Go, C#, JS/TS, HTML/CSS, PHP, Ruby, Lua, Bash… και οποιαδήποτε άλλη γλώσσα ορίσεις.
Ο κώδικας **μεταγλωττίζεται/εκτελείται στον υπολογιστή σου** με τα δικά σου εργαλεία (compilers, venv, JDK…) μέσω ενός μικρού τοπικού "runner" γραμμένου σε Python χωρίς εξαρτήσεις.

```
 Browser (GitHub Pages ή http://127.0.0.1:8787)          Ο υπολογιστής σου
 ┌──────────────────────────────────────────┐     HTTP   ┌──────────────────────────────┐
 │ Monaco editor · autocomplete · problems  │  ───────▶  │ runner/cdev_runner.py        │
 │ console · HTML preview · AI assistant    │  ◀───────  │  • αρχεία του workspace      │
 │ (JS/Python και χωρίς runner, στο browser)│   (SSE)    │  • exec_settings.json        │
 └──────────────────────────────────────────┘            │  • gcc / python / javac / …  │
                                                         └──────────────────────────────┘
```

## Δυνατότητες

| | |
|---|---|
| Editor | Monaco (η μηχανή του VS Code): tabs, syntax highlighting ~80 γλωσσών, minimap, multi-cursor, command palette (F1) |
| Αυτόματη συμπλήρωση | Πλήρες IntelliSense για JS/TS/CSS/HTML/JSON · keywords + snippets για C, C++, Python, Java, Rust, Go, C#, PHP, Ruby, Lua, Bash · λέξεις από όλα τα ανοιχτά αρχεία · προαιρετικά AI ghost-text (Tab) |
| Live λάθη | JS/TS/CSS/HTML/JSON στο browser· οι υπόλοιπες μέσω της εντολής `check` του runner **καθώς γράφεις** (gcc/g++, javac, rustc, go vet, Python syntax + pyflakes αν υπάρχει, php -l, ruby -wc) |
| Προτεινόμενη διόρθωση | `Ctrl+.` πάνω σε λάθος: η διόρθωση του ίδιου του compiler (gcc fix-it) ή **✨ Fix with AI** με diff για έλεγχο πριν την εφαρμογή |
| Κονσόλα | Ζωντανό output (stdout/stderr, χρώματα ANSI), είσοδος stdin για `scanf`/`input()`, Stop, shell εντολές στον φάκελο του project (π.χ. `pip install requests`), clickable `file:line` |
| Projects | Οδηγός "New project" με template ανά γλώσσα, εντοπισμό εργαλείων και `exec_settings.json` με **σχετικά ή απόλυτα** paths |
| AI | Claude (Anthropic API) ή οποιοδήποτε OpenAI-compatible endpoint (Ollama, LM Studio — τοπικά, δωρεάν). Chat με context (αρχείο, επιλογή, λάθη, κονσόλα), Insert / Apply με diff |
| Χωρίς runner | Επεξεργασία, live HTML preview, JavaScript σε sandbox, Python μέσω Pyodide (WebAssembly) |

## Γρήγορη εκκίνηση (online)

1. Άνοιξε τη σελίδα (GitHub Pages) και πάτα **⬇ Download runner**.
2. Διάβασε το κείμενο για το τι κάνει ο runner, τσέκαρε τη συναίνεση και κατέβασε το `CDev-runner.zip`. Η σελίδα το φτιάχνει από τον φάκελο `runner/` που είναι δίπλα στο `index.html`, μαζί με ένα `runner_config.json` που δείχνει πίσω στη σελίδα.
3. Αποσυμπίεσε και κάνε διπλό κλικ στο `start_cdev.bat` (Windows) ή `./start_cdev.sh`. Ανοίγει η σελίδα ήδη συνδεδεμένη· τα projects μπαίνουν στον φάκελο `workspace` δίπλα στον runner.

## Γρήγορη εκκίνηση (τοπικά, από το repo)

1. **Εκκίνηση runner** (χρειάζεται μόνο Python 3.8+):
   ```bash
   python runner/cdev_runner.py --root "D:/Projects" --open
   ```
   ή διπλό κλικ στο `start_cdev.bat` (Windows) / `./start_cdev.sh` (Linux/macOS).
2. Ανοίγει ο browser στο `http://127.0.0.1:8787/#runner=…&token=…` και συνδέεται αυτόματα.
3. **✨ New project** → διάλεξε γλώσσα → **F5**.

Το token αλλάζει σε κάθε εκκίνηση (εκτός αν ορίσεις σταθερό με `--token` ή στο `runner_config.json`) και τυπώνεται στην κονσόλα του runner.

## Δημοσίευση σε GitHub Pages

1. Ανέβασε τον φάκελο σε ένα repo (π.χ. `CDev`).
2. *Settings → Pages → Deploy from branch → main / (root)*.
3. Άνοιξε `https://<user>.github.io/CDev/`.
4. Ξεκίνα τον runner με `--ui-url https://<user>.github.io/CDev/` ώστε να τυπώνει έτοιμο link με το token:
   ```bash
   python runner/cdev_runner.py --root "D:/Projects" --ui-url https://USER.github.io/CDev/
   ```
   Ο runner δέχεται από προεπιλογή αιτήματα από `https://*.github.io` και `localhost`. Για άλλο domain: `--allow-origin https://my.domain`.

> Ο Chrome μπορεί να ζητήσει άδεια για πρόσβαση σε «συσκευές του τοπικού δικτύου» όταν μια https σελίδα μιλά στο `127.0.0.1` — πάτησε *Allow*.

## Φορητός δίσκος (USB)

```
E:\
├── CDev\                 ← αυτό το repo
│   ├── start_cdev.bat
│   ├── runner\  (runner_config.json: "root": "workspace")
│   ├── tools\python\     ← portable Python (προαιρετικά, το βρίσκει το .bat)
│   └── workspace\        ← τα projects σου
│       └── my-app\exec_settings.json
└── tools\                ← portable compilers
    ├── mingw64\bin\gcc.exe
    ├── jdk\bin\javac.exe
    └── python\python.exe
```

Στον οδηγό "New project" διάλεξε **Relative** και Tools folder `../../../tools` (ή πάτα 🔍 Detect). Έτσι το `exec_settings.json` γράφει π.χ. `"gcc": "../../../tools/mingw64/bin/gcc.exe"` και δουλεύει σε κάθε PC, όποιο γράμμα κι αν πάρει ο δίσκος. Οι φάκελοι των εργαλείων με απόλυτο path μπαίνουν αυτόματα στο `PATH` (απαραίτητο π.χ. για τα DLL του MinGW).

Για εντελώς **offline** χρήση κατέβασε μία φορά το Monaco τοπικά (`python runner/vendor_monaco.py`) και άνοιξε το UI από τον runner (`http://127.0.0.1:8787/`).

## `exec_settings.json`

Ο runner ψάχνει το πλησιέστερο `exec_settings.json` πάνω από το αρχείο που τρέχεις και το συγχωνεύει με τα [defaults](defaults/exec_settings.default.json) (`"inheritDefaults": false` για να το απενεργοποιήσεις). Στον editor έχει αυτόματη συμπλήρωση/έλεγχο από το [JSON schema](schema/exec_settings.schema.json) — άνοιξέ το με το κουμπί 🛠.

```json
{
  "version": 1,
  "pathMode": "relative",
  "toolsDir": "../tools",
  "outDir": "build",
  "env": { "MY_VAR": "1" },
  "path": ["../tools/mingw64/bin"],
  "tools": {
    "gcc": "../tools/mingw64/bin/gcc.exe",
    "python": { "windows": ".venv/Scripts/python.exe", "default": ".venv/bin/python" },
    "pythonBase": "python"
  },
  "languages": {
    "c": {
      "extensions": [".c"],
      "build": "${gcc} -g -Wall -o ${outFile} ${file}",
      "run": "${outFile}",
      "check": "${gcc} -fsyntax-only -Wall -fdiagnostics-parseable-fixits -I${srcDir} ${file}"
    },
    "python": {
      "extensions": [".py"],
      "run": "${python} -u ${file}",
      "check": "${python} ${runnerDir}/pycheck.py ${file}",
      "setup": "${pythonBase} -m venv .venv"
    },
    "kotlin": {
      "extensions": [".kt"],
      "build": "kotlinc ${file} -include-runtime -d ${outDir}/${raw:fileBase}.jar",
      "run": "java -jar ${outDir}/${raw:fileBase}.jar"
    }
  }
}
```

- **Paths**: σκέτο όνομα (`gcc`) → αναζήτηση στο PATH · σχετικό (`../tools/…`, `.venv/…`) → ως προς τον φάκελο του `exec_settings.json` · απόλυτο → όπως είναι.
- **Ανά λειτουργικό**: κάθε τιμή μπορεί να είναι `{"windows": …, "linux": …, "darwin": …, "default": …}`.
- **Εντολές**: `build`, `run` (τρέχει πρώτα το `build`, εκτός αν `"buildBeforeRun": false`), `check`, `setup`, `test`, `clean`. Μπορούν να είναι string, λίστα εντολών ή ανά OS.
- **Μεταβλητές** (μπαίνουν αυτόματα σε εισαγωγικά, `${raw:x}` χωρίς): `${file} ${fileRel} ${fileDir} ${fileName} ${fileBase} ${fileExt} ${outDir} ${outFile} ${projectDir} ${toolsDir} ${tmpDir} ${runnerDir} ${root} ${exe} ${env:NAME}` και κάθε εργαλείο (`${gcc}`, `${python}`…).
- **`requires`**: π.χ. `"Cargo.toml"` — η καταχώρηση ισχύει μόνο αν υπάρχει το αρχείο (έτσι τα `.rs` πάνε σε `cargo` μέσα σε Cargo project, αλλιώς σε `rustc`).
- **`check`**: οποιαδήποτε εντολή τυπώνει μηνύματα της μορφής `file:line:col: error: message` (ή `file:line: error:` + caret όπως ο javac). Τρέχει σε προσωρινό αντίγραφο του μη αποθηκευμένου κώδικα· με `"checkOnSaved": true` τρέχει στο αποθηκευμένο αρχείο (για εργαλεία project όπως το cargo).

## AI βοηθός

⚙️ Settings → AI:
- **Anthropic (Claude)**: βάλε API key (από console.anthropic.com). Προεπιλεγμένο μοντέλο `claude-opus-5-5`· για φθηνότερο/γρηγορότερο inline completion μπορείς να ορίσεις άλλο "Completion model" (π.χ. `claude-haiku-5-5`).
- **OpenAI-compatible**: π.χ. Ollama → Base URL `http://localhost:11434/v1`, model `qwen2.5-coder` (χωρίς key, όλα τοπικά). Για Ollama από GitHub Pages: `OLLAMA_ORIGINS=https://USER.github.io ollama serve`.

Το key αποθηκεύεται **μόνο** στο localStorage του browser σου και στέλνεται απευθείας στον provider — μη το χρησιμοποιείς σε κοινόχρηστους υπολογιστές.

## Ασφάλεια runner

- Ακούει μόνο στο `127.0.0.1`, ελέγχει `Host` header (DNS rebinding) και `Origin` (whitelist).
- Κάθε κλήση API θέλει το token της συνεδρίας.
- Η πρόσβαση σε αρχεία περιορίζεται στον φάκελο workspace.
- Όποιος έχει το token **μπορεί να εκτελέσει εντολές** στον υπολογιστή σου (αυτός είναι ο σκοπός του) — μην το μοιράζεσαι και μη χρησιμοποιείς `--no-token`.

## Συντομεύσεις

`Ctrl+S` αποθήκευση · `F5` εκτέλεση · `Shift+F5` stop · `Ctrl+Shift+B` build · `Ctrl+Space` συμπλήρωση · `Ctrl+.` quick fix · `F8` επόμενο λάθος · `Ctrl+Shift+A` AI · ``Ctrl+` `` panel · `F1` command palette

## Γνωστοί περιορισμοί

- Το output διαβάζεται από pipe, όχι από πραγματικό terminal: σε C/C++ κάνε `fflush(stdout)` πριν από `scanf` για να φαίνεται το prompt (τα templates το κάνουν ήδη). Προγράμματα που περιμένουν TTY (curses, χρώματα που εξαρτώνται από isatty) συμπεριφέρονται όπως σε pipe.
- Πλήρες semantic IntelliSense (go-to-definition, μέλη κλάσεων) υπάρχει για JS/TS· για τις υπόλοιπες γλώσσες: keywords, snippets, λέξεις του αρχείου και AI completion. (Επέκταση με language servers — clangd, pyright — μέσω του runner είναι φυσικό επόμενο βήμα.)
- Το "Open folder" μέσω browser (χωρίς runner) δουλεύει σε Chrome/Edge και επιτρέπει μόνο επεξεργασία· για εκτέλεση χρησιμοποίησε τον runner.

## Δομή

```
index.html, css/, js/          στατική εφαρμογή (χωρίς build step)
  js/main.js                   συνδεσμολογία UI
  js/editor.js                 Monaco, tabs, markers, quick fixes
  js/runner.js, js/fs.js       client του runner · file backends (runner / browser / scratch)
  js/console.js, js/preview.js κονσόλα · HTML preview, JS sandbox, Pyodide
  js/ai.js, js/languages.js    AI providers & chat · completions/snippets
  js/wizard.js, js/templates.js New project
  js/picker.js                 παράθυρο Browse (φάκελοι/αρχεία μέσω runner)
  js/download.js, js/zip.js    "Download runner": κείμενο συναίνεσης + δημιουργία ZIP στο browser
defaults/exec_settings.default.json   προεπιλεγμένες γλώσσες/εντολές
schema/exec_settings.schema.json      JSON schema
runner/cdev_runner.py          τοπικός server (Python stdlib)
runner/pycheck.py              Python checker (ast + pyflakes)
runner/vendor_monaco.py        Monaco για offline χρήση
start_cdev.bat / .sh           launchers
```
