let menuContainer = null;
let mainContent = null;
let menuData = null;

document.addEventListener("DOMContentLoaded", function () {
  menuContainer = document.getElementById("menuContainer");
  mainContent = document.getElementById("mainContent");

  if (!menuContainer) {
    console.error("Missing required element: #menuContainer");
    return;
  }

  if (!mainContent) {
    console.error("Missing required element: #mainContent");
    return;
  }

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
      if (!Array.isArray(data.menu)) {
        throw new Error("Invalid menu.json: missing 'menu' array.");
      }

      menuData = data;
      menuContainer.innerHTML = "";

      data.menu.forEach(function (item) {
        menuContainer.appendChild(createMenuItem(item, true));
      });

      renderHomeLessonsListIfAvailable();
    })
    .catch(function (error) {
      console.error(error);
      showError("Το αρχείο menu δεν μπόρεσε να φορτωθεί.", menuPath);
    });
}

function createMenuItem(item, isTopLevel) {
  const li = document.createElement("li");
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  if (hasChildren) {
    li.className = isTopLevel ? "nav-item dropdown" : "dropdown-submenu";

    const link = document.createElement("a");
    link.href = "#";
    link.textContent = item.title || "Untitled";

    if (isTopLevel) {
      link.className = "nav-link dropdown-toggle";
      link.setAttribute("data-bs-toggle", "dropdown");
      link.setAttribute("role", "button");
      link.setAttribute("aria-expanded", "false");
    } else {
      link.className = "dropdown-item dropdown-toggle";
    }

    const submenu = document.createElement("ul");
    submenu.className = "dropdown-menu";

    item.children.forEach(function (child) {
      submenu.appendChild(createMenuItem(child, false));
    });

    li.appendChild(link);
    li.appendChild(submenu);

    return li;
  }

  li.className = isTopLevel ? "nav-item" : "";

  const link = document.createElement("a");
  link.href = "#";
  link.textContent = item.title || "Untitled";
  link.className = isTopLevel ? "nav-link" : "dropdown-item";

  link.addEventListener("click", function (event) {
    event.preventDefault();
    loadContent(item);
  });

  li.appendChild(link);

  return li;
}

function loadContent(item) {
  if (!item || !item.contentPath || !item.type) {
    showError("Το επιλεγμένο item δεν έχει contentPath ή type.", "");
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

  showError(
    "Μη υποστηριζόμενος τύπος περιεχομένου: " + item.type,
    item.contentPath
  );
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
      removeDynamicScripts();
      mainContent.innerHTML = html;
      renderHomeLessonsListIfAvailable();
    })
    .catch(function (error) {
      console.error(error);
      showError("Το HTML περιεχόμενο δεν μπόρεσε να φορτωθεί.", path);
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
      removeDynamicScripts();

      mainContent.innerHTML = renderJsonContent(data);

      if (window.MathJax) {
        MathJax.typesetPromise();
      }

      loadJsonScriptPaths(data);
    })
    .catch(function (error) {
      console.error(error);
      showError("Το JSON περιεχόμενο δεν μπόρεσε να φορτωθεί.", path);
    });
}

function renderJsonContent(data) {
  let html = "";

  html += '<article class="tl-content-wrapper">';

  if (data.title) {
    html += '<h1 class="tl-content-title">' + escapeHtml(data.title) + "</h1>";
  }

  if (data.subtitle) {
    html +=
      '<p class="lead tl-content-subtitle">' +
      escapeHtml(data.subtitle) +
      "</p>";
  }

  if (Array.isArray(data.sections)) {
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
      return "<p>" + escapeHtml(section.text || "") + "</p>";

    case "html":
      return section.html || "";

    case "interactive":
      return renderInteractive(section);

    case "equation":
      return '<div class="tl-equation">$$' + (section.text || "") + "$$</div>";

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

  return (
    "<h" +
    safeLevel +
    ">" +
    escapeHtml(section.text || "") +
    "</h" +
    safeLevel +
    ">"
  );
}

function renderCode(section) {
  return (
    '<pre class="tl-code"><code>' +
    escapeHtml(section.text || "") +
    "</code></pre>"
  );
}

function renderInteractive(section) {
  if (!section.html) {
    return "";
  }

  return section.html;
}

function renderImage(section) {
  let html = "";

  html += '<figure class="my-4">';
  html +=
    '<img class="img-fluid rounded tl-image" src="' +
    escapeAttribute(section.src || "") +
    '" alt="' +
    escapeAttribute(section.alt || "") +
    '">';

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
  html +=
    '<iframe src="' +
    escapeAttribute(section.src || "") +
    '" allowfullscreen></iframe>';
  html += "</div>";

  if (section.caption) {
    html += '<figcaption class="tl-caption">' + escapeHtml(section.caption) + "</figcaption>";
  }

  html += "</figure>";

  return html;
}

function renderList(section) {
  if (!Array.isArray(section.items)) {
    return "";
  }

  let html = "<ul>";

  section.items.forEach(function (item) {
    html += "<li>" + escapeHtml(item) + "</li>";
  });

  html += "</ul>";

  return html;
}

function renderAlert(section) {
  const allowedStyles = [
    "primary",
    "secondary",
    "success",
    "danger",
    "warning",
    "info"
  ];

  const style = allowedStyles.includes(section.style) ? section.style : "info";

  return (
    '<div class="alert alert-' +
    style +
    '" role="alert">' +
    escapeHtml(section.text || "") +
    "</div>"
  );
}

function loadJsonScriptPaths(data) {
  if (!data.sections || !Array.isArray(data.sections)) {
    return;
  }

  const scriptPaths = collectScriptPaths(data.sections);

  if (scriptPaths.length === 0) {
    return;
  }

  loadScriptsSequentially(scriptPaths).catch(function (error) {
    console.error(error);
  });
}

function collectScriptPaths(sections) {
  const scriptPaths = [];

  sections.forEach(function (section) {
    if (section.scriptPath) {
      scriptPaths.push(section.scriptPath);
    }

    if (Array.isArray(section.scriptPaths)) {
      section.scriptPaths.forEach(function (scriptPath) {
        scriptPaths.push(scriptPath);
      });
    }

    if (Array.isArray(section.sections)) {
      const nestedScriptPaths = collectScriptPaths(section.sections);

      nestedScriptPaths.forEach(function (scriptPath) {
        scriptPaths.push(scriptPath);
      });
    }
  });

  return scriptPaths;
}

function loadScriptsSequentially(scriptPaths) {
  let chain = Promise.resolve();

  scriptPaths.forEach(function (scriptPath) {
    chain = chain.then(function () {
      return loadExternalScript(scriptPath);
    });
  });

  return chain;
}

function loadExternalScript(scriptPath) {
  return new Promise(function (resolve, reject) {
    const existingScript = document.querySelector(
      'script[data-dynamic-script="' + cssEscape(scriptPath) + '"]'
    );

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = scriptPath;
    script.setAttribute("data-dynamic-script", scriptPath);

    script.onload = function () {
      console.log("Loaded dynamic script:", scriptPath);
      resolve();
    };

    script.onerror = function () {
      const error = new Error("Could not load dynamic script: " + scriptPath);
      showError("Το JavaScript αρχείο δεν μπόρεσε να φορτωθεί.", scriptPath);
      reject(error);
    };

    document.body.appendChild(script);
  });
}

function removeDynamicScripts() {
  const scripts = document.querySelectorAll("script[data-dynamic-script]");

  scripts.forEach(function (script) {
    script.remove();
  });
}

function renderHomeLessonsListIfAvailable() {
  const homeLessonsList = document.getElementById("homeLessonsList");

  if (homeLessonsList && menuData) {
    renderHomeLessonsList(homeLessonsList);
  }
}

function renderHomeLessonsList(container) {
  const lessons = collectContentItems(menuData.menu).filter(function (item) {
    return item.type === "json";
  });

  if (lessons.length === 0) {
    container.innerHTML =
      '<p class="text-muted">Δεν έχουν οριστεί ακόμη μαθήματα.</p>';
    return;
  }

  let html = '<div class="list-group">';

  lessons.forEach(function (lesson) {
    html +=
      '<a href="#" class="list-group-item list-group-item-action" data-home-content="' +
      escapeAttribute(lesson.contentPath) +
      '">' +
      escapeHtml(lesson.title || "Untitled") +
      "</a>";
  });

  html += "</div>";

  container.innerHTML = html;

  const links = container.querySelectorAll("[data-home-content]");

  links.forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();

      const path = link.getAttribute("data-home-content");

      const lesson = lessons.find(function (item) {
        return item.contentPath === path;
      });

      if (lesson) {
        loadContent(lesson);
      }
    });
  });
}

function collectContentItems(items) {
  let result = [];

  items.forEach(function (item) {
    if (item.contentPath && item.type) {
      result.push(item);
    }

    if (Array.isArray(item.children)) {
      result = result.concat(collectContentItems(item.children));
    }
  });

  return result;
}

function showError(message, path) {
  if (!mainContent) {
    console.error(message, path || "");
    return;
  }

  mainContent.innerHTML =
    '<div class="container py-5">' +
    '<div class="alert alert-danger" role="alert">' +
    '<p class="mb-1">' +
    escapeHtml(message) +
    "</p>" +
    (path
      ? '<small>Path: <code>' + escapeHtml(path) + "</code></small>"
      : "") +
    "</div>" +
    "</div>";
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

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }

  return String(value).replace(/"/g, '\\"');
}