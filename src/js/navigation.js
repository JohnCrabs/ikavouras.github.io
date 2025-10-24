// src/js/navigation.js

document.addEventListener("DOMContentLoaded", () => {
  const sections = document.querySelectorAll("section");
  let currentSection = window.location.hash.substring(1) || "home";

  /**
   * Show a section and load its content
   * @param {string} sectionId
   */
  function showSection(sectionId) {
    currentSection = sectionId;

    // Load dynamic content
    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
    }

    // Show/hide static sections if any
    sections.forEach(sec => {
      sec.style.display = sec.id === sectionId ? "block" : "none";
    });

    // Apply translations
    const lang = localStorage.getItem("lang") || "en";
    if (typeof applyTranslations === "function") {
      applyTranslations(lang);
    }
  }

  /**
   * Update currentSection and URL hash without scrolling
   */
  function navigateTo(sectionId) {
    if (sectionId === currentSection) {
      // Already on this section; optionally reload content
      if (typeof loadMainContent === "function") {
        loadMainContent(sectionId);
      }
    } else {
      showSection(sectionId);
    }

    // Update hash without scrolling
    history.replaceState(null, null, `#${sectionId}`);
  }

  // Initial load
  showSection(currentSection);

  // Listen to hash changes (manual URL changes)
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.substring(1) || "home";
    showSection(hash);
  });

  // Handle nav link clicks
  document.querySelectorAll("nav a[href^='#']").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const sectionId = link.getAttribute("href").substring(1);
      navigateTo(sectionId);
    });
  });
});