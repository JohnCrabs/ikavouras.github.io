document.addEventListener("DOMContentLoaded", () => {
    fetch("src/html/profile.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("main-content").innerHTML = data;
        })
        .catch(error => console.error("Error loading footer:", error));
});

function loadMainContent(sectionId) {
  const container = document.getElementById("main-content");
  if (!container) return;

  // Map section IDs to HTML files
  const paths = {
    profile: "src/html/profile.html",
    projects: "src/html/projects.html",
    skills: "src/html/skills.html",
    publications: "src/html/publications.html",
    certificates: "src/html/certificates.html",
    contact: "src/html/contact.html",
  };

  const path = paths[sectionId];
  if (!path) {
    container.innerHTML = `<p>Section "${sectionId}" not found.</p>`;
    return;
  }

  // Show loading message
  container.innerHTML = "Loading...";

  // Fetch the HTML file and inject it
  fetch(path)
    .then(resp => {
      if (!resp.ok) throw new Error(`Failed to load ${path} (HTTP ${resp.status})`);
      return resp.text();
    })
    .then(html => {
      container.innerHTML = html;

      // After content loads, apply translations if available
      const lang = localStorage.getItem("lang") || "en";
      if (typeof applyTranslations === "function") {
        applyTranslations(lang);
      }
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = `<p>Error loading section: ${err.message}</p>`;
    });
}