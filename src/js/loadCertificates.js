// src/js/loadCertificates.js
(function () {
  const CONTAINER_ID = "certificates-container";
  const CERT_PATH = "assets/certificates/";
  const JSON_PATH = "src/json/certificates.json"; // JSON with PDF filenames

  function getCurrentLang() {
    return localStorage.getItem("lang") || "en";
  }

  function loadCertificates() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    // Show temporary loading text
    container.innerHTML = `<p data-i18n="loading_certificates">Loading certificates...</p>`;

    fetch(JSON_PATH)
      .then(res => res.json())
      .then(certificates => {
        if (!certificates || !certificates.length) {
          container.innerHTML = `<p data-i18n="no_certificates">No certificates available.</p>`;
          if (typeof applyTranslations === "function") applyTranslations(getCurrentLang());
          return;
        }

        const grid = document.createElement("div");
        grid.className = "certificates-grid";

        certificates.forEach(file => {
          const title = file.replace(/\.pdf$/i, "").replace(/_/g, " ");
          const card = document.createElement("div");
          card.className = "certificate-card";

          // Hide PDF toolbar/navigation/scrollbar
          const pdfUrl = `${CERT_PATH}${file}#toolbar=0&navpanes=0&scrollbar=0`;

          card.innerHTML = `
            <div class="certificate-preview">
              <iframe src="${pdfUrl}" type="application/pdf"></iframe>
            </div>
            <div class="certificate-info">
              <a href="${CERT_PATH + file}" target="_blank" rel="noopener noreferrer">${title}</a>
            </div>
          `;
          grid.appendChild(card);
        });

        container.innerHTML = "";
        container.appendChild(grid);

        // Apply translations after grid is built
        if (typeof applyTranslations === "function") {
          setTimeout(() => applyTranslations(getCurrentLang()), 20);
        }
      })
      .catch(err => {
        console.error("Failed to load certificates JSON:", err);
        container.innerHTML = `<p data-i18n="no_certificates">No certificates available.</p>`;
        if (typeof applyTranslations === "function") applyTranslations(getCurrentLang());
      });
  }

  // Expose globally
  window.loadCertificates = loadCertificates;
})();