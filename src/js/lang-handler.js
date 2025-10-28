// src/js/lang-handler.js
(function () {
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

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  function init() {
    const lang = getCurrentLang();
    applyTranslations(lang);
  }

  // 🔹 Apply on page load
  document.addEventListener("DOMContentLoaded", init);

  // 🔹 Re-apply after dynamic content load (navigation changes)
  window.addEventListener("contentLoaded", () => {
    const lang = getCurrentLang();
    setTimeout(() => applyTranslations(lang), 50);
  });

  // 🔹 React instantly when language is switched
  window.addEventListener("languageChanged", e => {
    const lang = e.detail.lang;
    applyTranslations(lang);
  });
})();