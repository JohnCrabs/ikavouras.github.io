// src/lang-handler.js
import { translations } from './translations.js';

export function applyTranslations(lang) {
  const dict = translations[lang];
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

// Listen for languageChanged events
window.addEventListener("languageChanged", e => {
  applyTranslations(e.detail.lang);
});

// Apply translations on page load
document.addEventListener("DOMContentLoaded", () => {
  const lang = localStorage.getItem("lang") || "en";
  applyTranslations(lang);
});