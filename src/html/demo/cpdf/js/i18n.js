/* CPDF — language and theme preferences.
 * Loaded in <head> (before CSS paints) so the saved theme applies without a flash.
 *   t(key, vars)   UI string for the current language, with {var} substitution
 *   tn(key, n)     plural form: looks up key.one / key.other and fills {n}
 *   L({ en, el })  inline bilingual text (used by the tool definitions)
 */
(function (global) {
  'use strict';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };

  const LANGS = { en: 'English', el: 'Ελληνικά' };
  const saved = store.get('cpdf.lang');
  const lang = LANGS[saved] ? saved : /^el\b/i.test(navigator.language || '') ? 'el' : 'en';
  document.documentElement.lang = lang;

  const THEMES = ['auto', 'light', 'dark'];
  let theme = THEMES.includes(store.get('cpdf.theme')) ? store.get('cpdf.theme') : 'auto';
  const applyTheme = () => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  };
  applyTheme();

  const STR = {
    en: {
      'nav.allTools': 'All tools', 'nav.merge': 'Merge', 'nav.split': 'Split', 'nav.compress': 'Compress', 'nav.edit': 'Edit',
      'theme.auto': 'Theme: automatic', 'theme.light': 'Theme: light', 'theme.dark': 'Theme: dark', 'lang.label': 'Language',

      'home.title': 'Every tool you need to work with <em>PDFs</em>, in one place',
      'home.subtitle': 'Merge, split, compress, convert, rotate, sign and edit PDFs on your own computer. Your files never leave your device.',
      'home.search': 'Search tools…', 'home.recent': 'Recently used', 'home.empty': 'No tools match your search.',
      'cat.All': 'All', 'cat.Organize': 'Organize', 'cat.Convert': 'Convert', 'cat.Edit': 'Edit', 'cat.Optimize': 'Optimize', 'cat.Security': 'Security',
      'badge.new': 'New', 'badge.hot': 'Hot', 'badge.libreoffice': 'Needs LibreOffice', 'badge.ghostscript': 'Needs Ghostscript',
      'feat.private.t': 'Private by design', 'feat.private.d': 'Everything runs on your computer. Nothing is uploaded anywhere.',
      'feat.fast.t': 'Nothing to install', 'feat.fast.d': 'Open the page and start working — on any computer, tablet or phone.',
      'feat.free.t': 'Free, no sign-up', 'feat.free.d': 'No accounts, watermarks or file limits. Open a tool and start working.',
      'footer': 'CPDF · Built with pdf.js, pdf-lib, qpdf and Tesseract · Files stay on your device',

      'tool.selectPdf': 'Select PDF file', 'tool.selectPdfs': 'Select PDF files',
      'tool.selectImage': 'Select image', 'tool.selectImages': 'Select images',
      'tool.selectOffice': 'Select documents', 'tool.dropHint': 'or drop them here', 'tool.dropOverlay': 'Drop files to add them',
      'tool.privacy': 'Your files are processed on your computer and never uploaded.',
      'n.files.one': '{n} file', 'n.files.other': '{n} files', 'n.pages.one': '{n} page', 'n.pages.other': '{n} pages',
      'tool.sortAZ': 'Sort A–Z', 'tool.addFiles': 'Add files', 'tool.replaceFile': 'Replace file', 'tool.addMore': 'Add more',
      'tool.remove': 'Remove {name}', 'tool.selectedOf': '{n} of {total} pages selected',
      'tool.apply': 'Apply', 'tool.all': 'All', 'tool.none': 'None', 'tool.invert': 'Invert',
      'tool.rotateAllLeft': 'Rotate all left', 'tool.rotateAllRight': 'Rotate all right', 'tool.reset': 'Reset', 'tool.reverse': 'Reverse order',
      'tool.rotateLeft': 'Rotate left', 'tool.rotateRight': 'Rotate right', 'tool.rotate': 'Rotate', 'tool.duplicate': 'Duplicate', 'tool.delete': 'Delete',
      'tool.rangePlaceholder': 'e.g. 1-3, 7', 'tool.rangeLabel': 'Page range', 'tool.minPage': 'A document needs at least one page.',
      'tool.wrongType.pdf': 'Please choose PDF files.', 'tool.wrongType.image': 'Please choose image files (JPG, PNG, …).',
      'tool.wrongType.office': 'Please choose Office or OpenDocument files.', 'tool.skipped': 'Some files were skipped because of their type.',
      'tool.reading': 'Reading files…', 'tool.processing': 'Processing…', 'tool.minFiles': 'Add at least {n} files.',
      'tool.readyOne': 'Your file is ready', 'tool.readyMany': '{n} files are ready',
      'tool.download': 'Download', 'tool.downloadAll': 'Download all (ZIP)', 'tool.zipping': 'Creating ZIP…',
      'tool.back': 'Back to options', 'tool.restart': 'Start over', 'tool.continue': 'Continue with another tool',
      'tool.continueTitle': 'Continue with…', 'tool.continueNone': 'No other tool accepts these files.',
      'tool.needs.libreoffice': 'This tool needs LibreOffice', 'tool.needs.ghostscript': 'This tool needs Ghostscript',
      'tool.needs.desc': 'CPDF uses this free program, installed on your computer, for this conversion. Install it, then restart CPDF (close the window and run start.bat / start.sh again).',
      'tool.needs.install': 'Download {name}', 'tool.needs.server': 'Start CPDF with start.bat or start.sh to use this tool.',
      'tool.optional.libreoffice': 'LibreOffice is installed, so the high-fidelity mode is available.',

      'pw.title': 'Password required', 'pw.message': '“{name}” is protected. Enter its password to open it.',
      'pw.placeholder': 'Password', 'pw.wrong': 'Wrong password, try again.', 'pw.ok': 'Open', 'pw.cancel': 'Cancel',
      'pw.decrypting': 'Unlocking…', 'pw.skipped': '{name} was skipped (no password).',

      'err.password': 'This PDF is password-protected.', 'err.invalid': 'This file is not a valid PDF.', 'err.generic': 'Something went wrong',
      'err.unicodeFont': 'Could not load the Unicode font — unsupported characters were replaced with “?”.',
      'err.server': 'The local CPDF server is not reachable. Start CPDF with start.bat or start.sh.',

      'ed.title': 'Edit PDF', 'ed.desc': 'Add text, drawings, highlights, shapes, images and signatures, or change existing text.',
      'ed.signTitle': 'Sign PDF', 'ed.signDesc': 'Upload a PDF, then draw, type or upload your signature and place it on the page.',
      'ed.selectPdf': 'Select PDF file', 'ed.dropHint': 'or drop it here', 'ed.open': 'Open', 'ed.download': 'Download',
      'ed.tool.select': 'Select & move', 'ed.tool.editText': 'Edit existing text', 'ed.tool.text': 'Add text', 'ed.tool.ink': 'Draw',
      'ed.tool.highlight': 'Highlight', 'ed.tool.rect': 'Rectangle', 'ed.tool.ellipse': 'Ellipse', 'ed.tool.line': 'Line', 'ed.tool.arrow': 'Arrow',
      'ed.tool.whiteout': 'Whiteout (cover content)', 'ed.tool.image': 'Insert image', 'ed.tool.sign': 'Signature',
      'ed.color': 'Color', 'ed.size': 'Size', 'ed.font': 'Font', 'ed.fontSize': 'Size', 'ed.opacity': 'Opacity', 'ed.bold': 'Bold', 'ed.italic': 'Italic',
      'ed.font.sans': 'Sans', 'ed.font.serif': 'Serif', 'ed.font.mono': 'Mono',
      'ed.pickHint': 'Pick a tool or select an item', 'ed.whiteoutHint': 'Whiteout has no style options',
      'ed.editTextHint': 'Click a line of text in the document to change it',
      'ed.undo': 'Undo (Ctrl+Z)', 'ed.redo': 'Redo (Ctrl+Y)', 'ed.delete': 'Delete (Del)', 'ed.zoomIn': 'Zoom in', 'ed.zoomOut': 'Zoom out', 'ed.fit': 'Fit to width',
      'ed.goPage': 'Go to page {n}', 'ed.openFirst': 'Open a PDF first.', 'ed.choosePdf': 'Please choose a PDF file.', 'ed.dropPdf': 'Drop a PDF file to edit it.',
      'ed.discard': 'Open a new file? Your unsaved edits will be lost.', 'ed.opening': 'Opening PDF…', 'ed.noEdits': 'No edits yet — downloading the original document.',
      'ed.saving': 'Saving PDF…', 'ed.saved': 'PDF downloaded.', 'ed.saveFailed': 'Could not save: {msg}', 'ed.typeHere': 'Type here',
      'ed.noText': 'No text found here. Scanned pages have no text — run OCR first.',
      'ed.coveredLines': '{n} edited line(s) sit inside an embedded graphic and could only be covered, not removed.',

      'sig.title': 'Create your signature', 'sig.draw': 'Draw', 'sig.type': 'Type', 'sig.upload': 'Upload', 'sig.clear': 'Clear',
      'sig.typePh': 'Type your name', 'sig.preview': 'Your signature', 'sig.choose': 'Choose image',
      'sig.pngHint': 'A PNG with a transparent background works best', 'sig.cancel': 'Cancel', 'sig.insert': 'Insert signature',
      'sig.typeFirst': 'Type your name first.', 'sig.drawFirst': 'Draw your signature first.', 'sig.color': 'Ink colour {n}', 'sig.close': 'Close',
    },
    el: {
      'nav.allTools': 'Όλα τα εργαλεία', 'nav.merge': 'Συγχώνευση', 'nav.split': 'Διαχωρισμός', 'nav.compress': 'Συμπίεση', 'nav.edit': 'Επεξεργασία',
      'theme.auto': 'Θέμα: αυτόματο', 'theme.light': 'Θέμα: φωτεινό', 'theme.dark': 'Θέμα: σκούρο', 'lang.label': 'Γλώσσα',

      'home.title': 'Όλα τα εργαλεία για <em>PDF</em> σε ένα σημείο',
      'home.subtitle': 'Συγχώνευση, διαχωρισμός, συμπίεση, μετατροπή, περιστροφή, υπογραφή και επεξεργασία PDF στον δικό σας υπολογιστή. Τα αρχεία σας δεν φεύγουν ποτέ από τη συσκευή σας.',
      'home.search': 'Αναζήτηση εργαλείων…', 'home.recent': 'Πρόσφατα', 'home.empty': 'Δεν βρέθηκαν εργαλεία.',
      'cat.All': 'Όλα', 'cat.Organize': 'Οργάνωση', 'cat.Convert': 'Μετατροπή', 'cat.Edit': 'Επεξεργασία', 'cat.Optimize': 'Βελτιστοποίηση', 'cat.Security': 'Ασφάλεια',
      'badge.new': 'Νέο', 'badge.hot': 'Δημοφιλές', 'badge.libreoffice': 'Θέλει LibreOffice', 'badge.ghostscript': 'Θέλει Ghostscript',
      'feat.private.t': 'Ιδιωτικότητα', 'feat.private.d': 'Όλα γίνονται στον υπολογιστή σας. Τίποτα δεν ανεβαίνει πουθενά.',
      'feat.fast.t': 'Χωρίς εγκατάσταση', 'feat.fast.d': 'Ανοίξτε τη σελίδα και ξεκινήστε — σε οποιονδήποτε υπολογιστή, tablet ή κινητό.',
      'feat.free.t': 'Δωρεάν, χωρίς λογαριασμό', 'feat.free.d': 'Χωρίς λογαριασμούς, υδατογραφήματα ή όρια αρχείων. Ανοίξτε ένα εργαλείο και ξεκινήστε.',
      'footer': 'CPDF · Με pdf.js, pdf-lib, qpdf και Tesseract · Τα αρχεία μένουν στη συσκευή σας',

      'tool.selectPdf': 'Επιλογή αρχείου PDF', 'tool.selectPdfs': 'Επιλογή αρχείων PDF',
      'tool.selectImage': 'Επιλογή εικόνας', 'tool.selectImages': 'Επιλογή εικόνων',
      'tool.selectOffice': 'Επιλογή εγγράφων', 'tool.dropHint': 'ή σύρετέ τα εδώ', 'tool.dropOverlay': 'Αφήστε τα αρχεία για να προστεθούν',
      'tool.privacy': 'Τα αρχεία σας επεξεργάζονται στον υπολογιστή σας και δεν ανεβαίνουν πουθενά.',
      'n.files.one': '{n} αρχείο', 'n.files.other': '{n} αρχεία', 'n.pages.one': '{n} σελίδα', 'n.pages.other': '{n} σελίδες',
      'tool.sortAZ': 'Ταξινόμηση Α–Ω', 'tool.addFiles': 'Προσθήκη αρχείων', 'tool.replaceFile': 'Αντικατάσταση', 'tool.addMore': 'Προσθήκη',
      'tool.remove': 'Αφαίρεση {name}', 'tool.selectedOf': '{n} από {total} σελίδες επιλεγμένες',
      'tool.apply': 'Εφαρμογή', 'tool.all': 'Όλες', 'tool.none': 'Καμία', 'tool.invert': 'Αντιστροφή',
      'tool.rotateAllLeft': 'Όλες αριστερά', 'tool.rotateAllRight': 'Όλες δεξιά', 'tool.reset': 'Επαναφορά', 'tool.reverse': 'Αντίστροφη σειρά',
      'tool.rotateLeft': 'Περιστροφή αριστερά', 'tool.rotateRight': 'Περιστροφή δεξιά', 'tool.rotate': 'Περιστροφή', 'tool.duplicate': 'Διπλότυπο', 'tool.delete': 'Διαγραφή',
      'tool.rangePlaceholder': 'π.χ. 1-3, 7', 'tool.rangeLabel': 'Εύρος σελίδων', 'tool.minPage': 'Ένα έγγραφο χρειάζεται τουλάχιστον μία σελίδα.',
      'tool.wrongType.pdf': 'Επιλέξτε αρχεία PDF.', 'tool.wrongType.image': 'Επιλέξτε εικόνες (JPG, PNG, …).',
      'tool.wrongType.office': 'Επιλέξτε αρχεία Office ή OpenDocument.', 'tool.skipped': 'Κάποια αρχεία παραλείφθηκαν λόγω τύπου.',
      'tool.reading': 'Ανάγνωση αρχείων…', 'tool.processing': 'Επεξεργασία…', 'tool.minFiles': 'Προσθέστε τουλάχιστον {n} αρχεία.',
      'tool.readyOne': 'Το αρχείο σας είναι έτοιμο', 'tool.readyMany': '{n} αρχεία είναι έτοιμα',
      'tool.download': 'Λήψη', 'tool.downloadAll': 'Λήψη όλων (ZIP)', 'tool.zipping': 'Δημιουργία ZIP…',
      'tool.back': 'Πίσω στις επιλογές', 'tool.restart': 'Από την αρχή', 'tool.continue': 'Συνέχεια με άλλο εργαλείο',
      'tool.continueTitle': 'Συνέχεια με…', 'tool.continueNone': 'Κανένα άλλο εργαλείο δεν δέχεται αυτά τα αρχεία.',
      'tool.needs.libreoffice': 'Αυτό το εργαλείο χρειάζεται το LibreOffice', 'tool.needs.ghostscript': 'Αυτό το εργαλείο χρειάζεται το Ghostscript',
      'tool.needs.desc': 'Το CPDF χρησιμοποιεί αυτό το δωρεάν πρόγραμμα, εγκατεστημένο στον υπολογιστή σας, για αυτή τη μετατροπή. Εγκαταστήστε το και ξεκινήστε ξανά το CPDF (κλείστε το παράθυρο και τρέξτε ξανά το start.bat / start.sh).',
      'tool.needs.install': 'Λήψη {name}', 'tool.needs.server': 'Ξεκινήστε το CPDF με το start.bat ή το start.sh για να χρησιμοποιήσετε αυτό το εργαλείο.',
      'tool.optional.libreoffice': 'Το LibreOffice είναι εγκατεστημένο, οπότε είναι διαθέσιμη η λειτουργία υψηλής πιστότητας.',

      'pw.title': 'Απαιτείται κωδικός', 'pw.message': 'Το «{name}» προστατεύεται. Πληκτρολογήστε τον κωδικό για να ανοίξει.',
      'pw.placeholder': 'Κωδικός', 'pw.wrong': 'Λάθος κωδικός, δοκιμάστε ξανά.', 'pw.ok': 'Άνοιγμα', 'pw.cancel': 'Ακύρωση',
      'pw.decrypting': 'Ξεκλείδωμα…', 'pw.skipped': 'Το {name} παραλείφθηκε (χωρίς κωδικό).',

      'err.password': 'Αυτό το PDF προστατεύεται με κωδικό.', 'err.invalid': 'Το αρχείο δεν είναι έγκυρο PDF.', 'err.generic': 'Κάτι πήγε στραβά',
      'err.unicodeFont': 'Η γραμματοσειρά Unicode δεν φορτώθηκε — οι μη υποστηριζόμενοι χαρακτήρες έγιναν «?».',
      'err.server': 'Ο τοπικός server του CPDF δεν απαντά. Ξεκινήστε το CPDF με το start.bat ή το start.sh.',

      'ed.title': 'Επεξεργασία PDF', 'ed.desc': 'Προσθέστε κείμενο, σχέδια, επισημάνσεις, σχήματα, εικόνες και υπογραφές ή αλλάξτε το υπάρχον κείμενο.',
      'ed.signTitle': 'Υπογραφή PDF', 'ed.signDesc': 'Ανεβάστε ένα PDF και μετά σχεδιάστε, πληκτρολογήστε ή ανεβάστε την υπογραφή σας.',
      'ed.selectPdf': 'Επιλογή αρχείου PDF', 'ed.dropHint': 'ή σύρετέ το εδώ', 'ed.open': 'Άνοιγμα', 'ed.download': 'Λήψη',
      'ed.tool.select': 'Επιλογή και μετακίνηση', 'ed.tool.editText': 'Αλλαγή υπάρχοντος κειμένου', 'ed.tool.text': 'Προσθήκη κειμένου', 'ed.tool.ink': 'Σχεδίαση',
      'ed.tool.highlight': 'Επισήμανση', 'ed.tool.rect': 'Ορθογώνιο', 'ed.tool.ellipse': 'Έλλειψη', 'ed.tool.line': 'Γραμμή', 'ed.tool.arrow': 'Βέλος',
      'ed.tool.whiteout': 'Κάλυψη (λευκό)', 'ed.tool.image': 'Εισαγωγή εικόνας', 'ed.tool.sign': 'Υπογραφή',
      'ed.color': 'Χρώμα', 'ed.size': 'Πάχος', 'ed.font': 'Γραμματοσειρά', 'ed.fontSize': 'Μέγεθος', 'ed.opacity': 'Αδιαφάνεια', 'ed.bold': 'Έντονα', 'ed.italic': 'Πλάγια',
      'ed.font.sans': 'Sans', 'ed.font.serif': 'Serif', 'ed.font.mono': 'Mono',
      'ed.pickHint': 'Διαλέξτε εργαλείο ή επιλέξτε ένα αντικείμενο', 'ed.whiteoutHint': 'Η κάλυψη δεν έχει επιλογές στυλ',
      'ed.editTextHint': 'Κάντε κλικ σε μια γραμμή κειμένου για να την αλλάξετε',
      'ed.undo': 'Αναίρεση (Ctrl+Z)', 'ed.redo': 'Επανάληψη (Ctrl+Y)', 'ed.delete': 'Διαγραφή (Del)', 'ed.zoomIn': 'Μεγέθυνση', 'ed.zoomOut': 'Σμίκρυνση', 'ed.fit': 'Προσαρμογή στο πλάτος',
      'ed.goPage': 'Μετάβαση στη σελίδα {n}', 'ed.openFirst': 'Ανοίξτε πρώτα ένα PDF.', 'ed.choosePdf': 'Επιλέξτε αρχείο PDF.', 'ed.dropPdf': 'Σύρετε ένα PDF για επεξεργασία.',
      'ed.discard': 'Άνοιγμα νέου αρχείου; Οι αλλαγές που δεν έχουν αποθηκευτεί θα χαθούν.', 'ed.opening': 'Άνοιγμα PDF…', 'ed.noEdits': 'Δεν υπάρχουν αλλαγές — γίνεται λήψη του αρχικού.',
      'ed.saving': 'Αποθήκευση PDF…', 'ed.saved': 'Η λήψη του PDF ολοκληρώθηκε.', 'ed.saveFailed': 'Η αποθήκευση απέτυχε: {msg}', 'ed.typeHere': 'Γράψτε εδώ',
      'ed.noText': 'Δεν βρέθηκε κείμενο εδώ. Οι σαρωμένες σελίδες δεν έχουν κείμενο — τρέξτε πρώτα OCR.',
      'ed.coveredLines': '{n} γραμμή(ές) βρίσκονται μέσα σε ενσωματωμένο γραφικό και μπορούσαν μόνο να καλυφθούν, όχι να αφαιρεθούν.',

      'sig.title': 'Δημιουργία υπογραφής', 'sig.draw': 'Σχεδίαση', 'sig.type': 'Πληκτρολόγηση', 'sig.upload': 'Εικόνα', 'sig.clear': 'Καθαρισμός',
      'sig.typePh': 'Πληκτρολογήστε το όνομά σας', 'sig.preview': 'Η υπογραφή σας', 'sig.choose': 'Επιλογή εικόνας',
      'sig.pngHint': 'Ιδανικά PNG με διάφανο φόντο', 'sig.cancel': 'Ακύρωση', 'sig.insert': 'Εισαγωγή υπογραφής',
      'sig.typeFirst': 'Πληκτρολογήστε πρώτα το όνομά σας.', 'sig.drawFirst': 'Σχεδιάστε πρώτα την υπογραφή σας.', 'sig.color': 'Χρώμα μελανιού {n}', 'sig.close': 'Κλείσιμο',
    },
  };

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
  function t(key, vars) {
    const s = STR[lang][key] ?? STR.en[key];
    return s == null ? key : fill(s, vars);
  }
  const tn = (key, n) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n });
  const L = (obj) => (obj && typeof obj === 'object' && 'en' in obj ? obj[lang] ?? obj.en : obj);

  /** Translates static markup: data-i18n (text), data-i18n-html (markup), data-i18n-attr="title:key;placeholder:key". */
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((n) => {
      // Keep injected icons: replace only the element's own text.
      const text = t(n.dataset.i18n);
      const textNode = Array.from(n.childNodes).find((c) => c.nodeType === 3 && c.textContent.trim());
      if (textNode) textNode.textContent = text;
      else n.append(text);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((n) => { n.innerHTML = t(n.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach((n) => {
      n.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) n.setAttribute(attr, t(key));
      });
    });
  }

  function setLang(next) {
    if (!LANGS[next] || next === lang) return;
    store.set('cpdf.lang', next);
    location.reload();
  }

  function cycleTheme() {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('cpdf.theme', theme);
    applyTheme();
    return theme;
  }

  global.I18N = { lang, LANGS, t, tn, L, apply, setLang, get theme() { return theme; }, cycleTheme, store };
  global.t = t;
  global.tn = tn;
  global.L = L;
})(window);
