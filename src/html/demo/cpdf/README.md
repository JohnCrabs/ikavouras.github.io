# CPDF

A local PDF toolkit that runs in your browser, similar in scope to iLovePDF or Adobe's online tools: 26 tools to organize, convert, edit, optimize and secure PDFs, plus a visual editor that can also change existing text. The interface is available in English and Greek, with light and dark themes.

You run CPDF on your own computer and it works fully offline. Processing happens in the browser (pdf.js, pdf-lib, qpdf and Tesseract compiled to WebAssembly), or through free programs installed on the same machine (LibreOffice, Ghostscript). Your files never leave your computer.

## Requirements

- [Node.js](https://nodejs.org) (any recent LTS version). It only runs the small local web server; no `npm install` is needed.
- A modern browser (Chrome, Edge, Firefox or Safari).
- **Optional:** [LibreOffice](https://www.libreoffice.org/download/download/) for Office → PDF and the high-fidelity PDF → Word mode.
- **Optional:** [Ghostscript](https://ghostscript.com/releases/gsdnld.html) for PDF/A, text-preserving grayscale, and compression that keeps text selectable.

No internet connection is needed: all libraries, fonts and OCR language data are bundled in `js/vendor/` and `css/fonts/`.

## Getting started

1. Download CPDF: on the GitHub page click **Code → Download ZIP** and extract it, or clone it:

   ```bash
   git clone https://github.com/<your-account>/CPDF.git
   ```

2. Start it:
   - **Windows:** double-click `start.bat`.
   - **macOS / Linux:** run `./start.sh` from a terminal in the CPDF folder. The first time, you may need `chmod +x start.sh`.

3. Your browser opens at <http://localhost:8000/>. If port 8000 is busy, the next free port is used. The console window shows the address, plus whether LibreOffice and Ghostscript were found.

4. To stop CPDF, close the console window or press **Ctrl+C**.

From a terminal, the equivalent command on any platform is:

```bash
node server.js 8000 --open
```

Install LibreOffice or Ghostscript any time; CPDF detects them the next time it starts. Tools that need a missing program show a download link instead of the upload area.

## Tools

| Category | Tools |
|---|---|
| Organize | Merge, Split, Organize (reorder / rotate / duplicate / delete), Extract pages, Delete pages, Rotate, Crop, Compare |
| Convert | Images → PDF, PDF → JPG/PNG, PDF → Word, Office → PDF¹, OCR (Greek + English) |
| Edit | Edit PDF, Sign PDF, Watermark, Page numbers, Fill form, Flatten |
| Optimize | Compress², Grayscale², PDF/A³, Repair, Edit metadata |
| Security | Protect (AES-256 password + permissions), Unlock |

¹ needs LibreOffice. ² better results with Ghostscript (works without it, by converting pages to images). ³ needs Ghostscript.

**Editor:** edit existing text (it is really replaced in the file, not covered; keeps position, size, colour and, when possible, the original font), add text (sans / serif / mono, bold, italic), freehand drawing, highlight, rectangle, ellipse, line, arrow, whiteout, images and signatures (draw, type or upload). Also undo / redo, copy / paste / duplicate, zoom and page thumbnails.

**Across the app:**
- Password-protected PDFs open with a password prompt.
- Results can be passed straight to another tool ("Continue with another tool").
- The home page shows recently used tools.
- Pages and files can be reordered by dragging, with the mouse or on touch screens (long-press).

## How it works

```
Browser                                         Your computer
┌────────────────────────────────────────┐      ┌───────────────────────────────┐
│ html/ + css/ + js/                     │      │ server.js (Node.js)           │
│  pdf.js     – render pages, read text  │ HTTP │  • serves the app             │
│  pdf-lib    – build and edit PDFs      │◄────►│  • /api/convert → LibreOffice │
│  qpdf.wasm  – encrypt, decrypt, repair │      │  • /api/gs      → Ghostscript │
│  tesseract  – OCR                      │      └───────────────────────────────┘
│  docx       – write Word files         │
└────────────────────────────────────────┘
```

The API only answers requests from the CPDF page itself:
- the server listens on `127.0.0.1`;
- it checks the `Host` and `Origin` headers;
- it requires a custom `X-CPDF` header, so other websites can't call it.

## Project structure

```
start.bat / start.sh   Launchers (Windows / macOS + Linux)
server.js              Static server + local API (no dependencies)
index.html             Redirects to html/index.html
html/
  index.html           Home: recent tools, categories, search, tool grid
  tool.html            Generic workspace that runs any tool (tool.html?tool=<id>)
  editor.html          Visual editor (Sign PDF: editor.html?mode=sign)
css/
  main.css             Design tokens (light/dark), top bar, home, modals, toasts
  tool.css             Workspace: upload → work → results, crop and form views
  editor.css           Editor layout, annotations, signature dialog
  fonts/               Inter, Dancing Script (UI / signatures), DejaVu Sans (PDF text)
js/
  i18n.js              Language (EN/EL) and theme; t(), tn(), L()
  common.js            PDFApp helpers: DOM, icons, pdf.js, fonts, qpdf, password, API, hand-off
  tools.js             Tool registry + shared helpers
  tools/*.js           Tool definitions by category (organize, convert, edit, optimize, security, compare, ocr)
  home.js              Home page
  tool-page.js         Workspace controller: intake, thumbnails, views, options, results
  pdf-text.js          Content-stream text engine: finds the operators behind each line, removes/rewrites them
  editor.js            Editor: rendering, annotations, text editing, export
  vendor/              pdf.js 3.11.174, pdf-lib 1.17.1, fontkit 1.1.1, JSZip 3.10.1,
                       qpdf-wasm 0.3.1 (qpdf 12.2), Tesseract.js 5.1.1 (+ eng/ell data), docx 8.5.0
```

### Adding a tool

Register an entry in one of the `js/tools/*.js` files with `PDFTools.register({...})`. The workspace builds the upload screen, thumbnails, options sidebar and results screen from that entry, so most tools only need:
- their `options`;
- a `run(ctx)` function that returns `[{ name, data }]`.

All visible text is bilingual: `{ en: '…', el: '…' }`. See the comment at the top of `js/tools.js` for every field.

### Adding a language

Add a dictionary to `STR` and a name to `LANGS` in `js/i18n.js`, then add the new key to the `{ en, el }` objects in the tool files. Missing keys fall back to English.

## Known limitations

- **Editing existing text** works line by line, on any page rotation. CPDF reads the page's content stream, finds the exact text operators that draw the line and deletes them on save: the old text is no longer in the file (it can't be found by search or copy/paste). The rest of the page is not touched and nothing else moves.
  - The new text uses the page's own font when that font is complete (not a subset) and can encode it, so it looks identical. Otherwise CPDF uses the closest standard font (Helvetica, Times or Courier). Greek and other non-Latin text uses DejaVu Sans, with simulated bold and italic.
  - Text inside embedded graphics (form XObjects) can't be removed this way. Those lines are covered instead, and CPDF tells you when that happens.
- **PDF → Word** in the browser rebuilds paragraphs, headings, bold and italics from the text, but not tables or images. Use the LibreOffice mode or "Exact look" when layout matters. Scanned PDFs need OCR first.
- **OCR** includes Greek and English. Other languages need their `.traineddata.gz` file in `js/vendor/tesseract/lang/` and an entry in the OCR tool's options.
- **Repair** rebuilds broken cross-reference tables. Files whose objects are themselves destroyed are recovered as page images when possible.
- **PDF/A** output from Ghostscript is PDF/A-2b. For certified archiving, check the result with a validator such as veraPDF.

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js), Mozilla (Apache-2.0)
- [pdf-lib](https://github.com/Hopding/pdf-lib) and [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) (MIT)
- [qpdf](https://github.com/qpdf/qpdf) (Apache-2.0), WebAssembly build [@neslinesli93/qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) (ISC)
- [Tesseract.js](https://github.com/naptha/tesseract.js) and tesseract.js-core (Apache-2.0), [tessdata](https://github.com/tesseract-ocr/tessdata) (Apache-2.0)
- [docx](https://github.com/dolanmiu/docx) (MIT)
- [JSZip](https://github.com/Stuk/jszip) (MIT / GPLv3)
- [DejaVu fonts](https://dejavu-fonts.github.io/) (free license), [Inter](https://rsms.me/inter/) and [Dancing Script](https://fonts.google.com/specimen/Dancing+Script) (SIL OFL)
- Optional external programs: [LibreOffice](https://www.libreoffice.org/) (MPL-2.0), [Ghostscript](https://ghostscript.com/) (AGPL-3.0). These are not bundled; CPDF calls them only if they are installed.
