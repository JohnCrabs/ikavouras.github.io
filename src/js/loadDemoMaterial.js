// src/js/loadDemoMaterial.js
(function () {
  const CONTAINER_ID = "demo-material-list";
  const JSON_PATH = "src/json/demo_material.json";

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  function loadDemoMaterial() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    container.innerHTML = `<p data-i18n="loading_demo_material">Loading demonstrative materials...</p>`;

    fetch(JSON_PATH)
      .then(res => res.json())
      .then(items => {
        if (!items || !items.length) {
          container.innerHTML = `<p data-i18n="no_demo_material">No demonstrative materials available.</p>`;
          if (typeof applyTranslations === "function") applyTranslations(getCurrentLang());
          return;
        }

        const list = document.createElement("div");
        list.className = "demo-material-list";

        items.forEach(item => {
          const entry = document.createElement("div");
          entry.className = "demo-material-entry";

          const title = item.title || "Untitled";
          const description = item.description || "";
          const links = item.links || [];

          let linksHTML = "";
          if (links.length > 0) {
            linksHTML = `
              <div class="demo-material-links">
                ${links
                  .map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
                  .join(" | ")}
              </div>
            `;
          }

          entry.innerHTML = `
            <h3>${title}</h3>
            <p>${description}</p>
            ${linksHTML}
          `;

          list.appendChild(entry);
        });

        container.innerHTML = "";
        container.appendChild(list);

        if (typeof applyTranslations === "function") {
          setTimeout(() => applyTranslations(getCurrentLang()), 20);
        }
      })
      .catch(err => {
        console.error("Failed to load demo materials:", err);
        container.innerHTML = `<p data-i18n="no_demo_material">No demonstrative materials available.</p>`;
        if (typeof applyTranslations === "function") applyTranslations(getCurrentLang());
      });
  }

  window.loadDemoMaterial = loadDemoMaterial;
})();