//// src/js/lang-handler.js
//(function () {
//  const MAIN_CONTENT_ID = "main-content";
//  const PUBLICATIONS_ID = "publications";
//  const PUBLICATIONS_JSON = "src/json/publications.json";
//
//  // --- Apply translations ---
//  function applyTranslations(lang) {
//    const dict = window.translations && window.translations[lang];
//    if (!dict) return;
//
//    document.querySelectorAll("[data-i18n]").forEach((el) => {
//      const key = el.getAttribute("data-i18n");
//      if (!key || !dict[key]) return;
//
//      if (el.hasAttribute("data-i18n-html")) el.innerHTML = dict[key];
//      else el.textContent = dict[key];
//    });
//  }
//
//  // --- Load section content safely ---
//  function loadContent(sectionId, lang) {
//    const main = document.getElementById(MAIN_CONTENT_ID);
//    if (!main) return;
//
//    main.classList.add("hidden");
//    main.classList.remove("visible");
//
//    // STEP 1: Load HTML
//    if (typeof loadMainContent === "function") {
//      loadMainContent(sectionId);
//    }
//
//    // STEP 2: Wait a bit, then apply translations
//    setTimeout(() => {
//      applyTranslations(lang);
//
//      // STEP 3: Publications special case — run last
//      if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
//        setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 200);
//      }
//
//      // STEP 4: Finally reveal the content
//      setTimeout(() => {
//        main.classList.remove("hidden");
//        main.classList.add("visible");
//      }, 50);
//    }, 100);
//  }
//
//  // --- Language helper ---
//  function getCurrentLang() {
//    return localStorage.getItem("lang") || "en";
//  }
//
//  // --- Respond to language switch ---
//  window.addEventListener("languageChanged", (e) => {
//    const lang = e.detail.lang;
//    const sectionId = (window.location.hash || "#profile").substring(1);
//    loadContent(sectionId, lang);
//  });
//
//  // --- Respond to navigation change ---
//  window.addEventListener("loadSectionContent", (e) => {
//    const sectionId = e.detail.sectionId;
//    loadContent(sectionId, getCurrentLang());
//  });
//
//  // --- Initialize on page load ---
//  function init() {
//    const sectionId = (window.location.hash || "#profile").substring(1);
//    const lang = getCurrentLang();
//    loadContent(sectionId, lang);
//  }
//
//  if (document.readyState === "loading") {
//    document.addEventListener("DOMContentLoaded", init);
//  } else {
//    init();
//  }
//})();
// src/js/lang-handler.js
(function() {
  const MAIN_CONTENT_ID = "main-content";
  const PUBLICATIONS_ID = "publications";
  const PUBLICATIONS_JSON = "src/json/publications.json";
  const CERTIFICATES_ID = "certificates";

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

  function loadContent(sectionId, lang) {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;

    // Hide content instantly
    main.classList.add("hidden");
    main.classList.remove("visible");

    // Load main content
    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
    }

    // Apply translations after content loaded
    setTimeout(() => {
      applyTranslations(lang);

      // Publications special case
      if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
        setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 50);
      }

      // ✅ Certificates special case
      if (sectionId === CERTIFICATES_ID && typeof loadCertificates === "function") {
        loadCertificates();
      }

      // Show content
      main.classList.add("visible");
      main.classList.remove("hidden");
    }, 10);
  }

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  // React to language changes
  window.addEventListener("languageChanged", e => {
    const lang = e.detail.lang;
    const sectionId = (window.location.hash || "#profile").substring(1);
    loadContent(sectionId, lang);
  });

  // React to navigation requests
  window.addEventListener("loadSectionContent", e => {
    const sectionId = e.detail.sectionId;
    loadContent(sectionId, getCurrentLang());
  });

  // Initial page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      const sectionId = (window.location.hash || "#profile").substring(1);
      loadContent(sectionId, getCurrentLang());
    });
  } else {
    const sectionId = (window.location.hash || "#profile").substring(1);
    loadContent(sectionId, getCurrentLang());
  }
})();