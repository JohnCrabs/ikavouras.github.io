/* publications-loader.js
   - Call: loadPublicationsFrom(paths, options)
   - paths: string or array of strings (URLs to JSON files)
   - options.containerId: id of container (default: 'publications-list')
*/
(function () {

  /* ---------------- Fetch JSON ---------------- */
  async function fetchJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to fetch ${path} (HTTP ${resp.status})`);
    return resp.json();
  }

  /* ---------------- Utility Functions ---------------- */
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  }

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  function makeBtn(href, text, cls="pub-btn") {
    const a = document.createElement("a");
    a.className = cls;
    a.href = href || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    return a;
  }

  /* ---------------- Popup Functions ---------------- */
  function openPopupWithPre(text, title="BibTeX") {
    const w = window.open("", "_blank", "width=650,height=450,resizable=yes,scrollbars=yes");
    const escaped = escapeHtml(text);

    w.document.open();
    w.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; background:#f7f9fc; margin:0; padding:20px; }
          .popup-container { max-width:600px; margin:0 auto; background:#fff; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15); }
          .popup-container h2 { color:#0073e6; margin-bottom:12px; text-align:left; }
          pre { background:#e8f0fe; padding:15px; border-radius:6px; overflow-x:auto; white-space: pre-wrap; word-break: break-word; }
          button { margin-top:15px; background:#0073e6; color:#fff; padding:8px 14px; border:none; border-radius:6px; cursor:pointer; font-size:0.9em; }
          button:hover { background:#005fa3; }
          @media (max-width:650px){ .popup-container{ width:90%; padding:15px; } }
        </style>
      </head>
      <body>
        <div class="popup-container">
          <h2>${escapeHtml(title)}</h2>
          <pre>${escaped}</pre>
          <button id="copyBtn">Copy to clipboard</button>
        </div>
        <script>
          const txt = ${JSON.stringify(text)};
          document.getElementById('copyBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(txt); alert('Copied!'); }
            catch(e){ alert('Copy failed: ' + e); }
          });
        </script>
      </body>
      </html>
    `);
    w.document.close();
  }

  function openPopupWithHtml(html, title="Text Citation") {
    const w = window.open("", "_blank", "width=650,height=320,resizable=yes,scrollbars=yes");
    const plain = stripHtml(html);

    w.document.open();
    w.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Georgia, serif; background:#f7f9fc; margin:0; padding:20px; }
          .popup-container { max-width:600px; margin:0 auto; background:#fff; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15); }
          .popup-container h2 { color:#0073e6; margin-bottom:12px; text-align:left; }
          .popup-container p { line-height:1.6; }
          button { margin-top:15px; background:#0073e6; color:#fff; padding:8px 14px; border:none; border-radius:6px; cursor:pointer; font-size:0.9em; }
          button:hover { background:#005fa3; }
          @media (max-width:650px){ .popup-container{ width:90%; padding:15px; } }
        </style>
      </head>
      <body>
        <div class="popup-container">
          <h2>${escapeHtml(title)}</h2>
          <p>${html}</p>
          <button id="copyBtn">Copy to clipboard</button>
        </div>
        <script>
          const txt = ${JSON.stringify(plain)};
          document.getElementById('copyBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(txt); alert('Copied!'); }
            catch(e){ alert('Copy failed: ' + e); }
          });
        </script>
      </body>
      </html>
    `);
    w.document.close();
  }

  /* ---------------- Create Publication Node ---------------- */
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

    // BibTeX button
    const bibBtn = document.createElement("a");
    bibBtn.href = "#";
    bibBtn.className = "pub-btn secondary";
    bibBtn.textContent = "BibTeX";
    bibBtn.addEventListener("click", e => { e.preventDefault(); openPopupWithPre(pub.bibtex || "BibTeX not available"); });
    linksRow.appendChild(bibBtn);

    // Text citation button
    const txtBtn = document.createElement("a");
    txtBtn.href = "#";
    txtBtn.className = "pub-btn secondary";
    txtBtn.textContent = "Text Citation";
    txtBtn.addEventListener("click", e => { e.preventDefault(); openPopupWithHtml(pub.citation || "Citation not available"); });
    linksRow.appendChild(txtBtn);

    pubDiv.appendChild(title);
    pubDiv.appendChild(authors);
    pubDiv.appendChild(year);
    pubDiv.appendChild(linksRow);

    return pubDiv;
  }

  /* ---------------- Main Loader Function ---------------- */
  async function loadPublicationsFrom(paths, opts={}) {
    const containerId = opts.containerId || "publications-list";
    const container = document.getElementById(containerId);
    if (!container) { console.error(`No element with id="${containerId}" found.`); return; }

    container.innerHTML = "Loading publications...";

    let pathArray = [];
    if (!paths) { container.innerHTML="No publication sources provided."; return; }
    if (typeof paths==="string") pathArray=[paths];
    else if (Array.isArray(paths)) pathArray=paths.slice();
    else { container.innerHTML="Invalid publications source."; return; }

    try {
      const fetches = pathArray.map(p => fetchJson(p).catch(e => ({ __error:e,__path:p })));
      const results = await Promise.all(fetches);

      const pubs = [];
      results.forEach(res=>{
        if(!res) return;
        if(res.__error){ console.warn(`Failed to load ${res.__path}:`, res.__error); return; }
        if(Array.isArray(res)) pubs.push(...res);
        else if(res.items && Array.isArray(res.items)) pubs.push(...res.items);
      });

      if(pubs.length===0){ container.innerHTML="No publications found."; return; }

      // optional: sort by year descending
      pubs.sort((a,b)=>(b.year||0)-(a.year||0));

      container.innerHTML="";
      pubs.forEach(pub => { container.appendChild(createPublicationNode(pub)); });

      console.log(`Loaded ${pubs.length} publications from ${pathArray.join(", ")}`);
    } catch(err) {
      console.error("Error loading publications:", err);
      container.innerHTML="Failed to load publications (see console).";
    }
  }

  // expose globally
  window.loadPublicationsFrom = loadPublicationsFrom;

})();