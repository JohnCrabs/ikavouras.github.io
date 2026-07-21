/* ************************************* */
/* Initial Page Load and Content Handling*/
/* ************************************* */
/* *************** START *************** */
/* ************************************* */
async function loadSiteConfig() {
  const response = await fetch("data/site.json");

  if (!response.ok) {
    throw new Error("Could not load data/site.json");
  }

  return await response.json();
}

async function loadHTML(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  return await response.text();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentHash(config) {
  const hash = window.location.hash;

  if (!hash || hash === "#") {
    return config.header.navigation[0].hash;
  }

  return hash;
}

function findCurrentNavItem(config) {
  const currentHash = getCurrentHash(config);

  const navItem = config.header.navigation.find((item) => {
    return item.hash === currentHash;
  });

  return navItem || config.header.navigation[0];
}

function renderHeader(config) {
  const headerRoot = document.getElementById("site-header");

  if (!headerRoot) {
    return;
  }

  const currentHash = getCurrentHash(config);

  const logoHTML =
    config.header.logoIMG && config.header.logoIMG.trim() !== ""
      ? `
        <a href="${config.header.navigation[0].hash}" class="site-logo" aria-label="${escapeHTML(config.site.title)}">
          <img src="${escapeHTML(config.header.logoIMG)}" alt="${escapeHTML(config.site.title)}">
        </a>
      `
      : `
        <a href="${config.header.navigation[0].hash}" class="site-logo">
          ${escapeHTML(config.header.text)}
        </a>
      `;

  const navItems = config.header.navigation
    .map((item) => {
      const isActive = item.hash === currentHash;
      const ariaCurrent = isActive ? ' aria-current="page"' : "";

      return `
        <li>
          <a href="${escapeHTML(item.hash)}" title="${escapeHTML(item.description)}"${ariaCurrent}>
            ${escapeHTML(item.title)}
          </a>
        </li>
      `;
    })
    .join("");

  headerRoot.innerHTML = `
      <div class="site-brand">
        ${logoHTML}
      </div>

      <nav class="site-nav" aria-label="Κύρια πλοήγηση">
        <ul>
          ${navItems}
        </ul>
      </nav>
    `;
}

function renderFooter(config) {
  const footerRoot = document.getElementById("site-footer");

  if (!footerRoot) {
    return;
  }

  const currentYear = new Date().getFullYear();

  const contactEmails = config.footer.contact.emails
    .map((item) => {
      return `
        <li>
          <span>${escapeHTML(item.label)}:</span>
          <a href="mailto:${escapeHTML(item.email)}">${escapeHTML(item.email)}</a>
        </li>
      `;
    })
    .join("");

  footerRoot.innerHTML = `
    <div class="site-footer-inner">

      <div class="site-footer-main">
        <div class="site-footer-brand">
          ${escapeHTML(config.footer.owner)}
        </div>

        <div class="site-footer-description">
          ${escapeHTML(config.footer.description)}
        </div>
      </div>

      <div class="site-footer-contact">
        <div class="site-footer-contact-title">
          ${escapeHTML(config.footer.contact.title)}
        </div>

        <ul>
          ${contactEmails}
        </ul>
      </div>

      <div class="site-footer-copy">
        © ${currentYear} TopoLearning. ${escapeHTML(config.footer.rights)}
      </div>

    </div>
  `;
}

async function renderView(config) {
  const contentRoot = document.getElementById("lesson-root");

  if (!contentRoot) {
    return;
  }

  const navItem = findCurrentNavItem(config);

  try {
    const source = await loadHTML(navItem.tlxPath);
    const blocks = TLXParser.parse(source);
    const html = TLXRenderer.render(blocks);

    document.title = `${navItem.title} | ${config.site.title}`;

    contentRoot.innerHTML = `
      <section class="page-view" data-view="${escapeHTML(navItem.hash)}">
        ${html}
      </section>
    `;

    TLXRenderer.activateInteractiveParts(contentRoot);
  } catch (error) {
    console.error(error);

    contentRoot.innerHTML = `
      <section class="page-error">
        <h1>Σφάλμα φόρτωσης</h1>
        <p>Δεν ήταν δυνατή η φόρτωση του αρχείου: ${escapeHTML(navItem.tlxPath)}</p>
      </section>
    `;
  }
}

async function renderApp(config) {
  renderHeader(config);
  renderFooter(config);
  await renderView(config);
}

async function initApp() {
  try {
    const siteConfig = await loadSiteConfig();

    await renderApp(siteConfig);

    window.addEventListener("hashchange", async () => {
      renderHeader(siteConfig);
      await renderView(siteConfig);
    });
  } catch (error) {
    console.error(error);

    const contentRoot = document.getElementById("lesson-root");

    if (contentRoot) {
      contentRoot.innerHTML = `
        <section class="page-error">
          <h1>Σφάλμα</h1>
          <p>Δεν ήταν δυνατή η φόρτωση του data/site.json.</p>
        </section>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initApp);
/* ************************************* */
/* **************** END **************** */
/* ************************************* */