(function () {
  const PUBLICATIONS_ID = "publications";
  const PUBLICATIONS_JSON = "src/json/publications.json";
  const DEFAULT_SECTION = "profile";
  let currentSection = null;

  function highlightNav(sectionId) {
    document.querySelectorAll("nav a[href^='#']").forEach(link => {
      const id = link.getAttribute("href").substring(1);
      link.classList.toggle("active", id === sectionId);
    });
  }

  function showSection(sectionId) {
    if (!sectionId) sectionId = DEFAULT_SECTION;
    if (sectionId === currentSection) return;
    currentSection = sectionId;

    if (typeof loadMainContent === "function") {
      loadMainContent(sectionId);
      window.dispatchEvent(new Event("contentLoaded"));
    }

    if (sectionId === PUBLICATIONS_ID && typeof loadPublicationsFrom === "function") {
      setTimeout(() => loadPublicationsFrom(PUBLICATIONS_JSON), 80);
    }

    if (typeof applyTranslations === "function") {
      const lang = localStorage.getItem("lang") || "en";
      setTimeout(() => applyTranslations(lang), 40);
    }

    highlightNav(sectionId);

    // SHOW content after everything is set
    const main = document.getElementById("main-content");
    if (main) main.style.visibility = "visible";
  }

  function handleNavigation() {
    const sectionId = (window.location.hash || `#${DEFAULT_SECTION}`).substring(1);
    showSection(sectionId);
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
        handleNavigation();
      });
    });

    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("popstate", handleNavigation);

    // FLICKER-FREE INITIAL LOAD
    const initialSection = window.location.hash
      ? window.location.hash.substring(1)
      : DEFAULT_SECTION;
    showSection(initialSection);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();