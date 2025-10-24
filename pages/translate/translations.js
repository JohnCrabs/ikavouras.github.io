// translations.js
export const translations = {
  en: {
    profileHeader: "Ioannis Kavouras",
    profileText: "Ioannis Kavouras is a graduate of the School of Rural, Surveying and Geo-Informatics Engineering of National Technical University of Athens (NTUA). Currently, he is a PhD candidate at the Photogrammetry Lab of NTUA. His expertise includes the development of AI-driven algorithms and applications for managing and  solving several engineering problems. Most of his developed applications utilize computer vision algorithm in combination with machine learning techniques for health diagnosis, climate change and smart urban development aiming at increasing the health and well-being of citizens and predicting the trends of various diseases (infectious and non-infectious). He has also participated, worked and is actively involved to several Hellenic and European funded research projects. In addition, he works as a professor at Metropolitan College (Marousi Department), teaching courses in the same domains."
  },

  gr: {
    profileHeader: "Ιωάννης Κάβουρας",
    profileText: "Ο Ιωάννης Κάβουρας είναι απόφοιτος της Σχολής Αγρονόμων, Τοπογράφου και Γεωπληροφορικής Μηχανικών του Εθνικού Μετσόβιου Πολυτεχνείου (ΕΜΠ). Αυτή τη στιγμή, είναι υποψήφιος διδάκτορας στο Εργαστήριο Φωτογραμμετρίας του ΕΜΠ. Η εξειδίκευσή του περιλαμβάνει την ανάπτυξη αλγορίθμων και εφαρμογών που βασίζονται στην Τεχνητή Νοημοσύνη για τη διαχείριση και επίλυση διαφόρων μηχανικών προβλημάτων. Οι περισσότερες από τις εφαρμογές που έχει αναπτύξει χρησιμοποιούν αλγόριθμους υπολογιστικής όρασης σε συνδυασμό με τεχνικές μηχανικής μάθησης για τη διάγνωση της υγείας, την κλιματική αλλαγή και την έξυπνη αστική ανάπτυξη, με στόχο την αύξηση της υγείας και της ευημερίας των πολιτών και την πρόβλεψη των τάσεων διαφόρων ασθενειών (μολυσματικών και μη μολυσματικών). Έχει επίσης συμμετάσχει, εργαστεί και συμμετέχει ενεργά σε πολλά ελληνικά και ευρωπαϊκά χρηματοδοτούμενα ερευνητικά έργα. Επιπλέον, εργάζεται ως καθηγητής στο Μητροπολιτικό Κολλέγιο (Τμήμα Αμαρουσίου), διδάσκοντας μαθήματα στους ίδιους τομείς."
  }
};


// Apply translation to all elements with data-translate keys
function applyTranslations(lang) {
  document.querySelectorAll("[data-translate]").forEach(el => {
    const key = el.getAttribute("data-translate");
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
}