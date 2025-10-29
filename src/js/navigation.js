// src/js/navigation.js
(function () {
  const PUBLICATIONS_ID = "publications";
  const DEMO_MATERIAL_ID = "demo_material"; // new section
  const DEFAULT_SECTION = "profile";
  let currentSection = null;

  function highlightNav(sectionId) {
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      link.classList.toggle("active", id === sectionId);
      link.style.color = id === sectionId ? "red" : ""; // active color
    });
  }

  function navigateTo(sectionId) {
    if (!sectionId) sectionId = DEFAULT_SECTION;
    if (sectionId === currentSection) return;
    currentSection = sectionId;

    // Dispatch event to let lang-handler load content
    window.dispatchEvent(new CustomEvent("loadSectionContent", { detail: { sectionId } }));

    // Special handling for demo_material if needed
    if (sectionId === DEMO_MATERIAL_ID && typeof loadDemoMaterial === "function") {
      setTimeout(() => loadDemoMaterial(), 20);
    }

    highlightNav(sectionId);
  }

  function initNavigation() {
    const navLinks = document.querySelectorAll("nav a[href^='#']");
    if (!navLinks.length) return setTimeout(initNavigation, 50);

    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sectionId = link.getAttribute("href").substring(1);
        if (sectionId === currentSection) return;
        history.pushState(null, "", `#${sectionId}`);
        navigateTo(sectionId);
      });
    });

    // Handle browser back/forward
    window.addEventListener("popstate", () => {
      const sectionId = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
      navigateTo(sectionId);
    });

    // Initial load
    const initialSection = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    navigateTo(initialSection);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();