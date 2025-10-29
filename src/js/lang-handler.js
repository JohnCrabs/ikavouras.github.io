// src/js/lang-handler.js
(function() {
  const MAIN_CONTENT_ID = "main-content";
  const PUBLICATIONS_ID = "publications";
  const CERTIFICATES_ID = "certificates";
  const DEMO_MATERIAL_ID = "demo_material";
  const PUBLICATIONS_JSON = "src/json/publications.json";

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

    setTimeout(() => {
      applyTranslations(lang);

      // Publications
      if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
        setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 50);
      }

      // Certificates
      if (sectionId === CERTIFICATES_ID && typeof loadCertificates === "function") {
        loadCertificates();
      }

      // Demonstrative material
      if (sectionId === DEMO_MATERIAL_ID && typeof loadDemoMaterial === "function") {
        loadDemoMaterial();
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
  function init() {
    const sectionId = (window.location.hash || "#profile").substring(1);
    loadContent(sectionId, getCurrentLang());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();