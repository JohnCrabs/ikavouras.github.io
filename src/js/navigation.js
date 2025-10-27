// src/js/navigation.js
// Robust version: keeps nav highlighting persistent and synced with hash always.

(function () {
  const PUBLICATIONS_ID = "publications";
  const PUBLICATIONS_JSON = "src/json/publications.json";
  const DEFAULT_SECTION = "profile";
  let currentSection = null;

  // Highlight the current nav link
  function highlightNav(sectionId) {
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      if (id === sectionId) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  // Show a section (calls your content functions)
  function showSection(sectionId) {
    if (!sectionId) sectionId = DEFAULT_SECTION;
    if (sectionId === currentSection) return;
    currentSection = sectionId;

    // Load content
    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
    }

    // Publications special case
    if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
      setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 80);
    }

    // Apply translations again
    if (typeof applyTranslations === "function") {
      const lang = localStorage.getItem("lang") || "en";
      setTimeout(() => applyTranslations(lang), 40);
    }

    highlightNav(sectionId);
  }

  // Handle hash-based navigation
  function handleHashChange() {
    const sectionId = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    showSection(sectionId);
  }

  // Init navigation once DOM is ready and nav exists
  function initNavigation() {
    const navLinks = document.querySelectorAll("nav a[href^='#']");
    if (!navLinks.length) {
      // Try again shortly if nav hasn't been parsed yet
      return setTimeout(initNavigation, 50);
    }

    // Attach click listeners
    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sectionId = link.getAttribute("href").substring(1);
        if (sectionId === currentSection) return; // no retrigger
        history.pushState(null, "", `#${sectionId}`);
        handleHashChange();
      });
    });

    // Handle browser navigation and hash changes
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);

    // Load the section matching the current hash or default
    handleHashChange();
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();