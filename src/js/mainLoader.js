/**
 * Loads an HTML file into the <main> section dynamically.
 * @param {string} filePath - The relative path to the HTML file to load.
 */
function loadMainContent(filePath) {
    const main = document.querySelector("main");
    if (!main) {
        console.error("No <main> element found in this document.");
        return;
    }

    fetch(filePath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${filePath} (${response.status})`);
            }
            return response.text();
        })
        .then(data => {
            main.innerHTML = data;
        })
        .catch(error => {
            console.error("Error loading main content:", error);
            main.innerHTML = `
                <section class="error">
                    <h2>Oops!</h2>
                    <p>Could not load content from <b>${filePath}</b>.</p>
                </section>`;
        });
}