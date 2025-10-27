(function () {
  const PUBLICATIONS_ID = "publications";
  const PUBLICATIONS_JSON = "src/json/publications.json";
  const DEFAULT_SECTION = "profile";
  let currentSection = null;

  // Highlight nav based on current section and set color
  function highlightNav(sectionId) {
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      const isActive = id === sectionId;
      link.classList.toggle("active", isActive);
      link.style.color = isActive ? "red" : ""; // red for active, default for others
    });
  }

  // Show a section
  function showSection(sectionId) {
    if (!sectionId) sectionId = DEFAULT_SECTION;
    if (sectionId === currentSection) return; // prevent retrigger
    currentSection = sectionId;

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

  // Handle navigation via clicks, hashchange, or popstate
  function handleNavigation() {
    const sectionId = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    showSection(sectionId);
  }

  // Initialize navigation
  function initNavigation() {
    const navLinks = document.querySelectorAll("nav a[href^='#']");
    if (!navLinks.length) return setTimeout(initNavigation, 50);

    // Attach click listeners
    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sectionId = link.getAttribute("href").substring(1);
        if (sectionId === currentSection) return;
        history.pushState(null, "", `#${sectionId}`);
        handleNavigation();
      });
    });

    // Listen for hash changes
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("popstate", handleNavigation);

    // --- FLICKER-FREE INITIAL LOAD ---
    // Only show DEFAULT_SECTION if no hash exists
    const initialHash = window.location.hash;
    const initialSection = initialHash ? initialHash.substring(1) : DEFAULT_SECTION;
    showSection(initialSection);
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();