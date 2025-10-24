export function initLangSwitcher() {
  const ACTIVE_COLOR = "#e63946";
  const INACTIVE_COLOR = "#0073e6";
  const BTN_EN_ID = "lang-en";
  const BTN_GR_ID = "lang-gr";

  let currentLang = localStorage.getItem("lang") || "en";

  function applyColors(btnEn, btnGr) {
    if (!btnEn || !btnGr) return;
    btnEn.style.color = currentLang === "en" ? ACTIVE_COLOR : INACTIVE_COLOR;
    btnGr.style.color = currentLang === "gr" ? ACTIVE_COLOR : INACTIVE_COLOR;
  }

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("lang", currentLang);
    const btnEn = document.getElementById(BTN_EN_ID);
    const btnGr = document.getElementById(BTN_GR_ID);
    applyColors(btnEn, btnGr);
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  }

  function attachListeners(btnEn, btnGr) {
    if (!btnEn || !btnGr) return false;
    btnEn.addEventListener("click", () => setLanguage("en"));
    btnGr.addEventListener("click", () => setLanguage("gr"));
    return true;
  }

  function installHandlers() {
    const btnEn = document.getElementById(BTN_EN_ID);
    const btnGr = document.getElementById(BTN_GR_ID);
    if (!btnEn || !btnGr) return false;
    attachListeners(btnEn, btnGr);
    applyColors(btnEn, btnGr);
    return true;
  }

  if (!installHandlers()) {
    const observer = new MutationObserver((mutations, obs) => {
      if (installHandlers()) obs.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const fallbackInterval = setInterval(() => {
      if (installHandlers()) clearInterval(fallbackInterval);
    }, 300);
  }

  // Fire initial languageChanged event
  window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
}