// src/js/loadCertificates.js
(function () {
  const CERTIFICATES_PATH = "assets/certificates/"; // Folder containing your PDF files
  const CONTAINER_ID = "certificates-container";

  /**
   * Dynamically load all certificates (PDFs) from a JSON index file
   * Example JSON structure: [{ "file": "example.pdf", "title": "Seminar on AI" }, ...]
   */
  async function loadCertificatesFrom(jsonPath = `${CERTIFICATES_PATH}certificates.json`) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    container.innerHTML = `<p class="loading" data-i18n="loading_certificates">Loading certificates...</p>`;

    try {
      const response = await fetch(jsonPath);
      if (!response.ok) throw new Error(`Failed to load certificates from ${jsonPath}`);
      const certificates = await response.json();

      if (!Array.isArray(certificates) || certificates.length === 0) {
        container.innerHTML = `<p data-i18n="no_certificates">No certificates available.</p>`;
        return;
      }

      // Create grid layout
      const grid = document.createElement("div");
      grid.className = "certificates-grid";

      certificates.forEach(cert => {
        const { file, title } = cert;
        const card = document.createElement("div");
        card.className = "certificate-card";

        // Each card opens the PDF in a new tab
        card.innerHTML = `
          <div class="certificate-preview">
            <iframe src="${CERTIFICATES_PATH + file}" type="application/pdf"></iframe>
          </div>
          <div class="certificate-info">
            <a href="${CERTIFICATES_PATH + file}" target="_blank" rel="noopener noreferrer">${title}</a>
          </div>
        `;

        grid.appendChild(card);
      });

      container.innerHTML = "";
      container.appendChild(grid);

      // Re-apply translations if available
      if (typeof applyTranslations === "function") {
        const lang = localStorage.getItem("lang") || "en";
        setTimeout(() => applyTranslations(lang), 20);
      }

    } catch (err) {
      console.error("Error loading certificates:", err);
      container.innerHTML = `<p data-i18n="error_loading_certificates">Error loading certificates.</p>`;
    }
  }

  // Expose function globally
  window.loadCertificatesFrom = loadCertificatesFrom;
})();