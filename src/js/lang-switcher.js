(function() {
  const ACTIVE_COLOR = "#e63946"; // red
  const INACTIVE_COLOR = "#0073e6"; // blue
  const BTN_EN_ID = "lang-en";
  const BTN_GR_ID = "lang-gr";

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  function setLanguage(lang) {
    localStorage.setItem("lang", lang);
    updateButtonColors();
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
  }

  function updateButtonColors() {
    const lang = getCurrentLang();
    const btnEn = document.getElementById(BTN_EN_ID);
    const btnGr = document.getElementById(BTN_GR_ID);
    if (!btnEn || !btnGr) return;
    btnEn.style.color = lang === "en" ? ACTIVE_COLOR : INACTIVE_COLOR;
    btnGr.style.color = lang === "gr" ? ACTIVE_COLOR : INACTIVE_COLOR;
  }

  function attachListeners() {
    const btnEn = document.getElementById(BTN_EN_ID);
    const btnGr = document.getElementById(BTN_GR_ID);
    if (!btnEn || !btnGr) return false;

    btnEn.addEventListener("click", () => setLanguage("en"));
    btnGr.addEventListener("click", () => setLanguage("gr"));

    updateButtonColors();
    return true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!attachListeners()) {
      // Fallback if buttons not yet in DOM
      const observer = new MutationObserver(() => { if (attachListeners()) observer.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
})();