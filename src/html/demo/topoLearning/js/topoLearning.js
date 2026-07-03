const menuContainer = document.getElementById("menuContainer");
const mainContent = document.getElementById("mainContent");

document.addEventListener("DOMContentLoaded", function () {
  loadMenu("data/menu.json");
});

function loadMenu(menuPath) {
  fetch(menuPath)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Menu file not found: " + menuPath);
      }

      return response.json();
    })
    .then(function (data) {
      menuContainer.innerHTML = "";

      data.menu.forEach(function (item) {
        menuContainer.appendChild(createMenuItem(item));
      });

      loadFirstAvailableContent(data.menu);
    })
    .catch(function (error) {
      console.error(error);
      showError("Το αρχείο του menu δεν μπόρεσε να φορτωθεί.");
    });
}

function createMenuItem(item) {
  const li = document.createElement("li");

  if (item.children && item.children.length > 0) {
    li.className = "nav-item dropdown";

    const link = document.createElement("a");
    link.className = "nav-link dropdown-toggle";
    link.href = "#";
    link.setAttribute("role", "button");
    link.setAttribute("data-bs-toggle", "dropdown");
    link.setAttribute("aria-expanded", "false");
    link.textContent = item.title;

    const submenu = document.createElement("ul");
    submenu.className = "dropdown-menu";

    item.children.forEach(function (child) {
      submenu.appendChild(createSubMenuItem(child));
    });

    li.appendChild(link);
    li.appendChild(submenu);

    return li;
  }

  li.className = "nav-item";

  const link = document.createElement("a");
  link.className = "nav-link";
  link.href = "#";
  link.textContent = item.title;

  link.addEventListener("click", function (event) {
    event.preventDefault();
    loadContent(item);
  });

  li.appendChild(link);

  return li;
}

function createSubMenuItem(item) {
  const li = document.createElement("li");

  if (item.children && item.children.length > 0) {
    li.className = "dropend";

    const link = document.createElement("a");
    link.className = "dropdown-item dropdown-toggle";
    link.href = "#";
    link.textContent = item.title;

    const submenu = document.createElement("ul");
    submenu.className = "dropdown-menu";

    item.children.forEach(function (child) {
      submenu.appendChild(createSubMenuItem(child));
    });

    li.appendChild(link);
    li.appendChild(submenu);

    return li;
  }

  const link = document.createElement("a");
  link.className = "dropdown-item";
  link.href = "#";
  link.textContent = item.title;

  link.addEventListener("click", function (event) {
    event.preventDefault();
    loadContent(item);
  });

  li.appendChild(link);

  return li;
}

function loadContent(item) {
  if (!item.contentPath || !item.type) {
    showError("Το επιλεγμένο menu item δεν έχει ορισμένο contentPath ή type.");
    return;
  }

  if (item.type === "html") {
    loadHtmlContent(item.contentPath);
    return;
  }

  if (item.type === "json") {
    loadJsonContent(item.contentPath);
    return;
  }

  showError("Μη υποστηριζόμενος τύπος περιεχομένου: " + item.type);
}

function loadHtmlContent(path) {
  fetch(path)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTML content not found: " + path);
      }

      return response.text();
    })
    .then(function (html) {
      mainContent.innerHTML = html;
    })
    .catch(function (error) {
      console.error(error);
      showError("Το HTML περιεχόμενο δεν μπόρεσε να φορτωθεί.");
    });
}

function loadJsonContent(path) {
  fetch(path)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("JSON content not found: " + path);
      }

      return response.json();
    })
    .then(function (data) {
      mainContent.innerHTML = renderJsonContent(data);

      if (window.MathJax) {
        MathJax.typesetPromise();
      }
    })
    .catch(function (error) {
      console.error(error);
      showError("Το JSON περιεχόμενο δεν μπόρεσε να φορτωθεί.");
    });
}

function renderJsonContent(data) {
  let html = "";

  html += '<article class="tl-content-wrapper">';

  if (data.title) {
    html += '<h1 class="tl-content-title">' + escapeHtml(data.title) + "</h1>";
  }

  if (data.subtitle) {
    html += '<p class="lead tl-content-subtitle">' + escapeHtml(data.subtitle) + "</p>";
  }

  if (data.sections && Array.isArray(data.sections)) {
    data.sections.forEach(function (section) {
      html += renderSection(section);
    });
  }

  html += "</article>";

  return html;
}

function renderSection(section) {
  switch (section.type) {
    case "heading":
      return renderHeading(section);

    case "paragraph":
      return "<p>" + escapeHtml(section.text) + "</p>";

    case "html":
      return section.html;

    case "equation":
      return '<div class="tl-equation">$$' + section.text + "$$</div>";

    case "code":
      return renderCode(section);

    case "image":
      return renderImage(section);

    case "video":
      return renderVideo(section);

    case "list":
      return renderList(section);

    case "alert":
      return renderAlert(section);

    default:
      return "";
  }
}

function renderHeading(section) {
  const level = section.level || 2;
  const safeLevel = Math.min(Math.max(level, 2), 6);

  return "<h" + safeLevel + ">" + escapeHtml(section.text) + "</h" + safeLevel + ">";
}

function renderCode(section) {
  const language = section.language ? escapeHtml(section.language) : "text";

  return `
    <pre class="tl-code"><code data-language="${language}">${escapeHtml(section.text)}</code></pre>
  `;
}

function renderImage(section) {
  let html = "";

  html += '<figure class="my-4">';
  html += '<img class="tl-image" src="' + escapeAttribute(section.src) + '" alt="' + escapeAttribute(section.alt || "") + '">';

  if (section.caption) {
    html += '<figcaption class="tl-caption">' + escapeHtml(section.caption) + "</figcaption>";
  }

  html += "</figure>";

  return html;
}

function renderVideo(section) {
  let html = "";

  html += '<figure class="my-4">';
  html += '<div class="ratio ratio-16x9">';
  html += '<iframe src="' + escapeAttribute(section.src) + '" allowfullscreen></iframe>';
  html += "</div>";

  if (section.caption) {
    html += '<figcaption class="tl-caption">' + escapeHtml(section.caption) + "</figcaption>";
  }

  html += "</figure>";

  return html;
}

function renderList(section) {
  let html = "<ul>";

  section.items.forEach(function (item) {
    html += "<li>" + escapeHtml(item) + "</li>";
  });

  html += "</ul>";

  return html;
}

function renderAlert(section) {
  const allowedStyles = ["primary", "secondary", "success", "danger", "warning", "info"];
  const style = allowedStyles.includes(section.style) ? section.style : "info";

  return `
    <div class="alert alert-${style}" role="alert">
      ${escapeHtml(section.text)}
    </div>
  `;
}

function loadFirstAvailableContent(menuItems) {
  const firstItem = findFirstContentItem(menuItems);

  if (firstItem) {
    loadContent(firstItem);
  }
}

function findFirstContentItem(items) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.contentPath && item.type) {
      return item;
    }

    if (item.children) {
      const found = findFirstContentItem(item.children);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function showError(message) {
  mainContent.innerHTML = `
    <div class="container py-5">
      <div class="alert alert-danger" role="alert">
        ${escapeHtml(message)}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}