(function() {
  function applyTranslations(lang) {
    const dict = window.translations && window.translations[lang];
    if (!dict) return;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key || !dict[key]) return;
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = dict[key];
      else el.textContent = dict[key];
    });
  }

  function init() {
    const lang = localStorage.getItem("lang") || "en";
    applyTranslations(lang);
  }

  // Apply translations on page load
  document.addEventListener("DOMContentLoaded", init);

  // Apply translations dynamically when languageChanged fires
  window.addEventListener("languageChanged", e => applyTranslations(e.detail.lang));
})();