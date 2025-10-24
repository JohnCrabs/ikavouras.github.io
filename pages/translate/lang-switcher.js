(function() {
  const ACTIVE_COLOR = "#e63946"; // red
  const INACTIVE_COLOR = "#0073e6"; // blue
  const BTN_EN_ID = "lang-en";
  const BTN_GR_ID = "lang-gr";

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  function setActiveButton(lang) {
    const btnEN = document.getElementById(BTN_EN_ID);
    const btnGR = document.getElementById(BTN_GR_ID);
    if (!btnEN || !btnGR) return;

    if (lang === "en") {
      btnEN.style.color = ACTIVE_COLOR;
      btnGR.style.color = INACTIVE_COLOR;
    } else {
      btnEN.style.color = INACTIVE_COLOR;
      btnGR.style.color = ACTIVE_COLOR;
    }
  }

  function setLanguage(lang) {
    localStorage.setItem("lang", lang);
    setActiveButton(lang);
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
  }

  function attachListeners() {
    const btnEN = document.getElementById(BTN_EN_ID);
    const btnGR = document.getElementById(BTN_GR_ID);
    if (!btnEN || !btnGR) return;

    btnEN.addEventListener("click", () => setLanguage("en"));
    btnGR.addEventListener("click", () => setLanguage("gr"));
  }

  function init() {
    attachListeners();
    const lang = getCurrentLang();
    setActiveButton(lang);
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();