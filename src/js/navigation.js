(function () {
  // --- Update active nav link based on URL hash ---
  function updateActiveNav() {
    const currentHash = (window.location.hash || "#home").substring(1); // default to home
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      link.classList.toggle("active", id === currentHash);
    });
  }

  // --- Load section content ---
  function showSection(sectionId) {
    if (!sectionId) sectionId = "home";

    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
    }

    // Publications special case
    if (sectionId === "publications" && typeof loadPublicationsFrom === "function") {
      setTimeout(() => loadPublicationsFrom("src/json/publications.json"), 80);
    }

    // Apply translations
    const lang = localStorage.getItem("lang") || "en";
    if (typeof applyTranslations === "function") {
      setTimeout(() => applyTranslations(lang), 50);
    }

    // Update nav highlighting
    updateActiveNav();
  }

  // --- Initialize navigation ---
  function initNavigation() {
    const navLinks = document.querySelectorAll("nav a[href^='#']");

    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sectionId = link.getAttribute("href").substring(1);

        // Update URL without scrolling
        const scrollY = window.scrollY;
        history.pushState(null, "", `#${sectionId}`);
        window.scrollTo(0, scrollY);

        showSection(sectionId);
      });
    });

    // Handle back/forward
    window.addEventListener("popstate", () => {
      const sectionId = (window.location.hash || "#home").substring(1);
      showSection(sectionId);
    });

    // Handle hash changes (other scripts)
    window.addEventListener("hashchange", () => {
      const sectionId = (window.location.hash || "#home").substring(1);
      showSection(sectionId);
    });

    // Initial page load
    const initialSection = (window.location.hash || "#home").substring(1);
    showSection(initialSection);
  }

  document.addEventListener("DOMContentLoaded", initNavigation);
})();