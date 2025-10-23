function openBibtexWindow(id) {
  const bibtexContent = document.getElementById(id)?.innerText || "BibTeX entry not found.";
  const bibWindow = window.open("", "_blank", "width=500,height=400,resizable=yes,scrollbars=yes");
  bibWindow.document.write(`
    <html>
      <head>
        <title>BibTeX Entry</title>
        <style>
          body {
            font-family: monospace;
            padding: 20px;
            background: #f9f9f9;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
        </style>
      </head>
      <body>
        <h2>BibTeX Citation</h2>
        <pre>${bibtexContent}</pre>
      </body>
    </html>
  `);
  bibWindow.document.close();
}

function openTextCitationWindow(id) {
  const textContent = document.getElementById(id)?.innerHTML || "Text citation not found.";
  const textWindow = window.open("", "_blank", "width=500,height=300,resizable=yes,scrollbars=yes");
  textWindow.document.write(`
    <html>
      <head>
        <title>Text Citation</title>
        <style>
          body { font-family: 'Georgia', serif; padding: 20px; background: #f9f9f9; }
          p { line-height: 1.6; font-size: 1em; }
        </style>
      </head>
      <body>
        <h2>Text Citation</h2>
        <p>${textContent}</p>
      </body>
    </html>
  `);
  textWindow.document.close();
}

/* publications-loader.js
   - Call: loadPublicationsFrom(paths, options)
   - paths: string or array of strings (URLs to JSON files)
   - options.containerId: id of container (default: 'publications-list')
*/
(function () {
  async function fetchJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to fetch ${path} (HTTP ${resp.status})`);
    return resp.json();
  }

  function makeBtn(href, text, cls = "pub-btn") {
    const a = document.createElement("a");
    a.className = cls;
    a.href = href || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    return a;
  }

  function createPublicationNode(pub) {
    const pubDiv = document.createElement("div");
    pubDiv.className = "publication";

    const title = document.createElement("h2");
    title.innerHTML = pub.title || "Untitled";

    const authors = document.createElement("p");
    authors.innerHTML = `<strong>Authors:</strong> ${pub.authors || "—"}`;

    const year = document.createElement("p");
    year.innerHTML = `<strong>Year:</strong> ${pub.year || "—"}`;

    const linksRow = document.createElement("div");
    linksRow.className = "pub-links";

    if (pub.source) linksRow.appendChild(makeBtn(pub.source, "View Source", "pub-btn"));
    if (pub.pdf) linksRow.appendChild(makeBtn(pub.pdf, "Open PDF", "pub-btn tertiary"));

    // BibTeX button (opens popup)
    const bibBtn = document.createElement("a");
    bibBtn.href = "#";
    bibBtn.className = "pub-btn secondary";
    bibBtn.textContent = "BibTeX";
    bibBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openPopupWithPre(pub.bibtex || "BibTeX not available", "BibTeX");
    });
    linksRow.appendChild(bibBtn);

    // Text citation button
    const txtBtn = document.createElement("a");
    txtBtn.href = "#";
    txtBtn.className = "pub-btn secondary";
    txtBtn.textContent = "Text Citation";
    txtBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openPopupWithHtml(pub.citation || "Citation not available", "Text Citation");
    });
    linksRow.appendChild(txtBtn);

    pubDiv.appendChild(title);
    pubDiv.appendChild(authors);
    pubDiv.appendChild(year);
    pubDiv.appendChild(linksRow);

    return pubDiv;
  }

  function openPopupWithPre(text, title = "") {
    const w = window.open("", "_blank", "width=600,height=450,resizable=yes,scrollbars=yes");
    const escaped = escapeHtml(text);
    w.document.write(`
      <html><head><title>${escapeHtml(title)}</title>
        <style>body{font-family:monospace;padding:20px;background:#f9f9f9}pre{white-space:pre-wrap}</style>
      </head><body>
        <h2>${escapeHtml(title)}</h2>
        <pre>${escaped}</pre>
        <button id="copyBtn">Copy to clipboard</button>
        <script>
          const txt = ${JSON.stringify(text)};
          document.getElementById('copyBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(txt); alert('Copied to clipboard'); }
            catch(e){ alert('Copy failed: ' + e); }
          });
        <\/script>
      </body></html>`);
    w.document.close();
  }

  function openPopupWithHtml(html, title = "") {
    const w = window.open("", "_blank", "width=600,height=320,resizable=yes,scrollbars=yes");
    const plain = stripHtml(html);
    w.document.write(`
      <html><head><title>${escapeHtml(title)}</title>
        <style>body{font-family:Georgia,serif;padding:20px;background:#f9f9f9;}p{line-height:1.6}</style>
      </head><body>
        <h2>${escapeHtml(title)}</h2>
        <p>${html}</p>
        <button id="copyBtn">Copy to clipboard</button>
        <script>
          const txt = ${JSON.stringify(plain)};
          document.getElementById('copyBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(txt); alert('Copied to clipboard'); }
            catch(e){ alert('Copy failed: ' + e); }
          });
        <\/script>
      </body></html>`);
    w.document.close();
  }

  /* helpers */
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  /**
   * Main function to call.
   * paths: string or array of strings (URLs)
   * opts: { containerId: 'publications-list' (default), clearBefore: true (default) }
   */
  async function loadPublicationsFrom(paths, opts = {}) {
    const containerId = opts.containerId || "publications-list";
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`No element with id="${containerId}" found.`);
      return;
    }

    container.innerHTML = "Loading publications...";

    // normalize paths -> array
    let pathArray = [];
    if (!paths) {
      console.error("No paths provided to loadPublicationsFrom()");
      container.innerHTML = "No publication sources provided.";
      return;
    }
    if (typeof paths === "string") pathArray = [paths];
    else if (Array.isArray(paths)) pathArray = paths.slice();
    else {
      console.error("paths must be string or array of strings");
      container.innerHTML = "Invalid publications source.";
      return;
    }

    // fetch all JSON files in parallel (fail-safe)
    try {
      const fetches = pathArray.map(p => fetchJson(p).catch(e => ({ __error: e, __path: p })));
      const results = await Promise.all(fetches);

      // flatten results into a single publications array
      const pubs = [];
      results.forEach(res => {
        if (!res) return;
        if (res.__error) {
          console.warn(`Failed to load ${res.__path}:`, res.__error);
          return;
        }
        if (Array.isArray(res)) pubs.push(...res);
        else if (res.items && Array.isArray(res.items)) pubs.push(...res.items);
        else {
          console.warn("JSON didn't contain array—skipping:", res);
        }
      });

      if (pubs.length === 0) {
        container.innerHTML = "No publications found (check JSON files).";
        return;
      }

      // optional: sort by year desc if present
      pubs.sort((a,b) => (b.year || 0) - (a.year || 0));

      // render
      container.innerHTML = "";
      pubs.forEach(pub => {
        const node = createPublicationNode(pub);
        container.appendChild(node);
      });

      console.log(`Loaded ${pubs.length} publications from ${pathArray.join(", ")}`);
    } catch (err) {
      console.error("Error loading publications:", err);
      container.innerHTML = "Failed to load publications (see console).";
    }
  }

  // expose globally for simple calls
  window.loadPublicationsFrom = loadPublicationsFrom;
})();