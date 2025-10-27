// src/js/navigation.js
(function () {
  const PUBLICATIONS_ID = "publications";
  const PUBLICATIONS_JSON = "src/json/publications.json";
  const DEFAULT_SECTION = "profile";
  let currentSection = null;

  // Highlight nav based on current hash
  function highlightNav(sectionId) {
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      link.classList.toggle("active", id === sectionId);
    });
  }

  // Load content for the section
  function showSection(sectionId) {
    if (!sectionId) sectionId = DEFAULT_SECTION;
    if (sectionId === currentSection) return;
    currentSection = sectionId;

    // Load main content only after hash is known
    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
    }

    // Publications special case
    if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
      setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 80);
    }

    // Apply translations
    if (typeof applyTranslations === "function") {
      const lang = localStorage.getItem("lang") || "en";
      setTimeout(() => applyTranslations(lang), 40);
    }

    highlightNav(sectionId);
  }

  // Handle hash changes
  function handleNavigation() {
    const sectionId = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    highlightNav(sectionId);
    showSection(sectionId);
  }

  // Initialize navigation
  function initNavigation() {
    const navLinks = document.querySelectorAll("nav a[href^='#']");
    if (!navLinks.length) return setTimeout(initNavigation, 50);

    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sectionId = link.getAttribute("href").substring(1);
        if (sectionId === currentSection) return;
        history.pushState(null, "", `#${sectionId}`);
        handleNavigation();
      });
    });

    // Listen for hash changes and back/forward
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("popstate", handleNavigation);

    // --- FLICKER-FREE INITIAL LOAD ---
    // Read current hash, do NOT load profile by default
    const initialSection = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    showSection(initialSection);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();