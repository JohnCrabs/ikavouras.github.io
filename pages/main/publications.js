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
