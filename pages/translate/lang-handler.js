// language-handler.js
(function() {

  function applyTranslations(lang) {
    const dict = window.translations[lang];
    if (!dict) return;

    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key || !dict[key]) return;

      if (el.hasAttribute("data-i18n-html")) {
        el.innerHTML = dict[key];
      } else {
        el.textContent = dict[key];
      }
    });
  }

  // Listen for language changes
  window.addEventListener("languageChanged", e => {
    applyTranslations(e.detail.lang);
  });

  // Apply saved language on load
  document.addEventListener("DOMContentLoaded", () => {
    const lang = localStorage.getItem("lang") || "en";
    applyTranslations(lang);
  });

  // Expose for dynamic content
  window.applyTranslations = applyTranslations;

})();
