# CFiles

Browser-based viewer & editor for **JSON, YAML, CSV, TXT and BIN** files — a static site that runs on **GitHub Pages** (no backend).

- One **Open** action (plus drag & drop and paste). The file type is detected automatically and the matching viewer/editor is loaded.
- **JSON / YAML** → key-value tree editor + raw source.
- **CSV** → editable table + raw source.
- **TXT** → text editor with line numbers and find / replace.
- **BIN** → two panes: bytes in **HEX or OCTAL** (user choice) + decoded text, with byte editing and an inspector.
- **Create Synthetic Files** (JSON / YAML / CSV / TXT only — never BIN): offline table-based generator or an optional free LLM with no backend — WebLLM running in the browser (WebGPU, no key), or OpenRouter / Groq / Gemini called directly with your own key.

## Structure

```
index.html            app shell
html/help.html        user guide
css/styles.css        styles (light / dark)
assets/favicon.svg
js/core/              utils, CSV parser, type detection
js/viewers/           tree (JSON/YAML), table (CSV), text, binary
js/synthetic/         data tables, local generator, AI providers, dialog
js/app.js             open / tabs / save / convert
samples/              example files for testing
```

YAML parsing uses [js-yaml 4.1.0](https://github.com/nodeca/js-yaml) from cdnjs; the optional in-browser LLM uses [WebLLM](https://github.com/mlc-ai/web-llm) from jsDelivr (loaded only when chosen).

## Run locally

Any static server works, e.g.

```bash
python -m http.server 8080
```

then open http://localhost:8080. (Opening `index.html` directly from disk also works.)

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`.
3. The site is served at `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so the files are served as-is.

---
© 2026 Ioannis A. Kavouras. All rights reserved.
