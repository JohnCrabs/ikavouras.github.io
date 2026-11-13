/* CPDF — Security tools: protect and unlock (qpdf compiled to WebAssembly). */
(function () {
  'use strict';
  const { base, eachFile } = PDFTools.helpers;

  function randomPassword() {
    const a = new Uint8Array(18);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a)).replace(/[^A-Za-z0-9]/g, '');
  }

  PDFTools.register(
    {
      id: 'protect', icon: 'lock', color: '#dc3e42', category: 'Security',
      name: { en: 'Protect PDF', el: 'Κλείδωμα PDF' },
      desc: { en: 'Encrypt a PDF with a password (AES-256) and restrict printing or copying.', el: 'Κρυπτογραφήστε ένα PDF με κωδικό (AES-256) και περιορίστε την εκτύπωση ή την αντιγραφή.' },
      action: { en: 'Protect PDF', el: 'Κλείδωμα' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'user', label: { en: 'Password to open', el: 'Κωδικός ανοίγματος' }, type: 'password', default: '',
          hint: { en: 'Leave empty to allow opening without a password and only apply the restrictions below.', el: 'Αφήστε το κενό για άνοιγμα χωρίς κωδικό, με μόνο τους παρακάτω περιορισμούς.' } },
        { id: 'confirm', label: { en: 'Repeat password', el: 'Επανάληψη κωδικού' }, type: 'password', default: '', showIf: (o) => !!o.user },
        { id: 'allowPrint', label: { en: 'Allow printing', el: 'Να επιτρέπεται η εκτύπωση' }, type: 'checkbox', default: true },
        { id: 'allowCopy', label: { en: 'Allow copying text and images', el: 'Να επιτρέπεται η αντιγραφή κειμένου και εικόνων' }, type: 'checkbox', default: true },
        { id: 'allowModify', label: { en: 'Allow editing', el: 'Να επιτρέπεται η επεξεργασία' }, type: 'checkbox', default: true },
        { id: 'allowForms', label: { en: 'Allow filling forms and comments', el: 'Να επιτρέπεται η συμπλήρωση φορμών και τα σχόλια' }, type: 'checkbox', default: true },
        { id: 'owner', label: { en: 'Permissions password (optional)', el: 'Κωδικός δικαιωμάτων (προαιρετικός)' }, type: 'password', default: '',
          hint: { en: 'Needed to change the restrictions later. If empty, a random one is used.', el: 'Χρειάζεται για να αλλάξουν αργότερα οι περιορισμοί. Αν μείνει κενός, μπαίνει τυχαίος.' } },
      ],
      async run({ files, options: o, progress }) {
        const restricted = !(o.allowPrint && o.allowCopy && o.allowModify && o.allowForms);
        if (!o.user && !restricted) throw new Error(L({ en: 'Enter a password or choose at least one restriction', el: 'Δώστε κωδικό ή διαλέξτε τουλάχιστον έναν περιορισμό' }));
        if (o.user && o.user !== o.confirm) throw new Error(L({ en: 'The passwords don’t match', el: 'Οι κωδικοί δεν ταιριάζουν' }));
        const owner = o.owner || randomPassword();
        const args = ['/in.pdf', '--encrypt', o.user, owner, '256',
          `--print=${o.allowPrint ? 'full' : 'none'}`,
          `--extract=${o.allowCopy ? 'y' : 'n'}`,
          `--modify=${o.allowModify ? 'all' : 'none'}`,
          `--annotate=${o.allowForms ? 'y' : 'n'}`,
          `--form=${o.allowForms ? 'y' : 'n'}`,
          '--', '/out.pdf'];
        return eachFile(files, progress, async (f) => {
          const r = await PDFApp.qpdf(args, f.bytes);
          if (!r.out || r.code === 2) throw new Error(r.log || t('err.generic'));
          return { name: `${base(f)}_protected.pdf`, data: r.out };
        });
      },
    },
    {
      id: 'unlock', icon: 'unlock', color: '#7c66dc', category: 'Security',
      name: { en: 'Unlock PDF', el: 'Ξεκλείδωμα PDF' },
      desc: { en: 'Remove the password and restrictions from a PDF you have access to.', el: 'Αφαιρέστε τον κωδικό και τους περιορισμούς από ένα PDF στο οποίο έχετε πρόσβαση.' },
      action: { en: 'Unlock PDF', el: 'Ξεκλείδωμα' },
      note: { en: 'You’ll be asked for the password when you add a protected file.', el: 'Θα σας ζητηθεί ο κωδικός όταν προσθέσετε ένα κλειδωμένο αρχείο.' },
      accept: 'pdf', multiple: true, view: 'files',
      async run({ files }) {
        // Files are decrypted on intake (PDFApp.preparePdf), so the bytes are already unlocked.
        return files.map((f) => ({
          name: `${base(f)}_unlocked.pdf`, data: f.bytes,
          note: f.encrypted ? null : L({ en: 'This PDF was not protected', el: 'Αυτό το PDF δεν ήταν κλειδωμένο' }),
        }));
      },
    },
  );
})();
