// lang-switcher.js
(function () {
  const ACTIVE_COLOR = "#e63946"; // red
  const INACTIVE_COLOR = "#0073e6"; // blue
  const BTN_EN_ID = "lang-en";
  const BTN_GR_ID = "lang-gr";

  let currentLang = localStorage.getItem("lang") || "en";

  function applyColors(btnEn, btnGr) {
    if (!btnEn || !btnGr) return;
    if (currentLang === "en") {
      btnEn.style.color = ACTIVE_COLOR;
      btnGr.style.color = INACTIVE_COLOR;
    } else {
      btnEn.style.color = INACTIVE_COLOR;
      btnGr.style.color = ACTIVE_COLOR;
    }
  }

  function onClickEn(e) {
    currentLang = "en";
    localStorage.setItem("lang", currentLang);
    applyColors(document.getElementById(BTN_EN_ID), document.getElementById(BTN_GR_ID));
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  }
  function onClickGr(e) {
    currentLang = "gr";
    localStorage.setItem("lang", currentLang);
    applyColors(document.getElementById(BTN_EN_ID), document.getElementById(BTN_GR_ID));
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  }

  function installHandlersWhenReady() {
    const btnEn = document.getElementById(BTN_EN_ID);
    const btnGr = document.getElementById(BTN_GR_ID);

    if (btnEn && btnGr) {
      // remove previous handlers if any (safe)
      btnEn.removeEventListener("click", onClickEn);
      btnGr.removeEventListener("click", onClickGr);

      btnEn.addEventListener("click", onClickEn);
      btnGr.addEventListener("click", onClickGr);

      applyColors(btnEn, btnGr);
      return true;
    }
    return false;
  }

  // Try immediately (if header already present)
  if (!installHandlersWhenReady()) {
    // If not present yet, observe DOM until both buttons appear
    const observer = new MutationObserver((mutations, obs) => {
      if (installHandlersWhenReady()) {
        obs.disconnect();
      }
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });

    // As a fallback, try again after short intervals (in case MutationObserver misses)
    const fallbackInterval = setInterval(() => {
      if (installHandlersWhenReady()) {
        clearInterval(fallbackInterval);
      }
    }, 300);
  }

  // expose current language and a setter (optional)
  window.getCurrentLanguage = () => currentLang;
  window.setCurrentLanguage = (lang) => {
    if (lang !== "en" && lang !== "gr") return;
    currentLang = lang;
    localStorage.setItem("lang", lang);
    applyColors(document.getElementById(BTN_EN_ID), document.getElementById(BTN_GR_ID));
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  };

  // When the script loads, dispatch initial languageChanged after a tiny delay
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  }, 0);
})();
