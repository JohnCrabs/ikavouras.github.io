// language-handler.js
import { translations } from "./translations.js";

function applyTranslations(lang) {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
}

// Listen for language switch
window.addEventListener("languageChanged", (e) => {
  applyTranslations(e.detail.lang);
});

// On first load, also apply from saved language
document.addEventListener("DOMContentLoaded", () => {
  const lang = localStorage.getItem("lang") || "en";
  applyTranslations(lang);
});