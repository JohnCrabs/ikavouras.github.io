const TLXRenderer = (() => {
  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInlineContent(value) {
    const text = String(value || "");

    const urlPattern = /\\url\{([^{}]+)\}\{([^{}]+)\}/g;

    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      const label = match[1];
      const href = match[2];

      result += escapeHTML(before);
      result += `<a href="${escapeHTML(href)}">${escapeHTML(label)}</a>`;

      lastIndex = urlPattern.lastIndex;
    }

    result += escapeHTML(text.slice(lastIndex));

    return result.replace(/\n/g, "<br>");
  }

  function renderTextWithLineBreaks(value) {
    return renderInlineContent(value);
  }

  function renderPageMeta(block) {
    const title = block.data.title || "";
    const description = block.data.description || "";

    return `
      <header class="tl-page-header">
        <h1>${escapeHTML(title)}</h1>
        <p>${renderInlineContent(description)}</p>
      </header>
    `;
  }

  function renderSimpleBlock(block, className, defaultTitle) {
    return `
      <div class="${className}">
        <strong>${escapeHTML(defaultTitle)}:</strong>
        <div>${renderInlineContent(block.content)}</div>
      </div>
    `;
  }

  function renderTitledBlock(block, className) {
    return `
      <div class="${className}">
        <h3>${escapeHTML(block.title)}</h3>
        <div>${renderInlineContent(block.content)}</div>
      </div>
    `;
  }

  function renderImage(block) {
    const src = block.data.src || "";
    const alt = block.data.alt || "";
    const caption = block.data.caption || "";

    return `
      <figure class="tl-figure">
        <img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}">
        ${
          caption
            ? `<figcaption>${renderInlineContent(caption)}</figcaption>`
            : ""
        }
      </figure>
    `;
  }

  function renderVideo(block) {
    const src = block.data.src || "";
    const caption = block.data.caption || "";

    return `
      <figure class="tl-video">
        <iframe src="${escapeHTML(src)}" allowfullscreen></iframe>
        ${
          caption
            ? `<figcaption>${renderInlineContent(caption)}</figcaption>`
            : ""
        }
      </figure>
    `;
  }

  function renderTable(block) {
    const allowedStyles = ["default", "striped", "bordered", "compact", "academic"];
    const allowedAlignments = ["left", "center", "right"];
    const allowedWidths = ["auto", "full"];

    const tableStyle = allowedStyles.includes(block.style)
      ? block.style
      : "default";

    const tableAlign = allowedAlignments.includes(block.align)
      ? block.align
      : "left";

    const tableWidth = allowedWidths.includes(block.width)
      ? block.width
      : "full";

    const headers = block.columns
      .map((column) => `<th>${renderInlineContent(column)}</th>`)
      .join("");

    const rows = block.rows
      .map((row) => {
        const cells = row
          .map((cell) => `<td>${renderInlineContent(cell)}</td>`)
          .join("");

        return `<tr>${cells}</tr>`;
      })
      .join("");

    const titleHTML = block.title
      ? `<div class="tl-table-title">${renderInlineContent(block.title)}</div>`
      : "";

    const captionHTML = block.caption
      ? `<figcaption class="tl-table-caption">${renderInlineContent(block.caption)}</figcaption>`
      : "";

    return `
      <figure class="tl-table-figure">
        ${titleHTML}

        <div class="tl-table-wrapper tl-table-width-${tableWidth}">
          <table class="tl-table tl-table-${tableStyle} tl-table-align-${tableAlign}">
            <thead>
              <tr>${headers}</tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        ${captionHTML}
      </figure>
    `;
  }

  function renderQuiz(block) {
    const options = block.options
      .map((option) => {
        return `
          <li>
            <button class="tl-quiz-option" data-answer="${escapeHTML(option.key)}">
              <strong>${escapeHTML(option.key)}.</strong>
              ${renderInlineContent(option.text)}
            </button>
          </li>
        `;
      })
      .join("");

    return `
      <div class="tl-quiz" data-correct-answer="${escapeHTML(block.answer)}">
        <h3>Quiz</h3>
        <p>${renderInlineContent(block.question)}</p>

        <ul>
          ${options}
        </ul>

        <div class="tl-quiz-feedback" hidden data-original-feedback="${escapeHTML(block.feedback)}">
          ${renderInlineContent(block.feedback)}
        </div>
      </div>
    `;
  }

  function renderInteractive2DPlane(block) {
    const objects = block.objects
      .map((object) => {
        return `
          <button class="tl-object-card" data-object-type="${escapeHTML(object.type)}">
            ${escapeHTML(object.label)}
          </button>
        `;
      })
      .join("");

    return `
      <div class="tl-interactive-scene" data-scene-type="2d">
        <div class="tl-scene-header">
          <h3>${escapeHTML(block.title)}</h3>
          <p>${renderInlineContent(block.instructions)}</p>
        </div>

        <div class="tl-scene-layout">
          <aside class="tl-object-palette">
            <h4>Objects</h4>
            ${objects}
          </aside>

          <div
            class="tl-canvas-2d"
            data-grid="${escapeHTML(block.grid)}"
            style="min-height: ${escapeHTML(block.height)}px;"
          >
            2D workspace placeholder
          </div>
        </div>
      </div>
    `;
  }

  function renderCards(block) {
    const allowedColumns = [1, 2, 3, 4];

    const columns = allowedColumns.includes(block.columns)
      ? block.columns
      : 3;

    const cards = block.items
      .map((item) => {
        const title = item.title || "";
        const description = item.description || "";
        const image = item.image || "";
        const url = item.url || "#";
        const tag = item.tag || title || "TLX";

        const imageHTML = image
          ? `
            <img
              class="tl-card-image"
              src="${escapeHTML(image)}"
              alt="${escapeHTML(title)}"
            >
          `
          : "";

        const tagHTML = `
          <div class="tl-card-tag" ${image ? "hidden" : ""}>
            ${escapeHTML(tag)}
          </div>
        `;

        return `
          <a class="tl-card" href="${escapeHTML(url)}">
            <div class="tl-card-media">
              ${imageHTML}
              ${tagHTML}
            </div>

            <div class="tl-card-body">
              <h3>${escapeHTML(title)}</h3>
              <p>${renderInlineContent(description)}</p>
            </div>
          </a>
        `;
      })
      .join("");

    return `
      <div class="tl-card-grid tl-card-grid-${columns}">
        ${cards}
      </div>
    `;
  }

  function renderBlock(block) {
    switch (block.type) {
      case "page":
      case "lesson":
        return renderPageMeta(block);

      case "section":
        return `<h2>${escapeHTML(block.content)}</h2>`;

      case "subsection":
        return `<h3>${escapeHTML(block.content)}</h3>`;

      case "subsubsection":
        return `<h4>${escapeHTML(block.content)}</h4>`;

      case "paragraph":
        return `<p>${renderInlineContent(block.content)}</p>`;

      case "note":
        return renderSimpleBlock(block, "tl-note", "Note");

      case "tip":
        return renderSimpleBlock(block, "tl-tip", "Tip");

      case "warning":
        return renderSimpleBlock(block, "tl-warning", "Warning");

      case "definition":
        return renderTitledBlock(block, "tl-definition");

      case "example":
        return renderTitledBlock(block, "tl-example");

      case "exercise":
        return renderTitledBlock(block, "tl-exercise");

      case "solution":
        return renderTitledBlock(block, "tl-solution");

      case "equation":
        return `
          <div class="tl-equation">
            ${escapeHTML(block.content)}
          </div>
        `;

      case "code":
        return `
          <div class="tl-code-block">
            ${
              block.language
                ? `<div class="tl-code-title">${escapeHTML(block.language)}</div>`
                : ""
            }
            <pre><code>${escapeHTML(block.content)}</code></pre>
          </div>
        `;

      case "image":
        return renderImage(block);

      case "video":
        return renderVideo(block);

      case "table":
        return renderTable(block);

      case "cards":
        return renderCards(block);

      case "quiz":
        return renderQuiz(block);

      case "interactive2Dplane":
        return renderInteractive2DPlane(block);

      default:
        return `
          <div class="tl-warning">
            Unknown TLX block: ${escapeHTML(block.command || block.type)}
          </div>
        `;
    }
  }

  function render(blocks) {
    return blocks.map(renderBlock).join("\n");
  }

  function activateInteractiveParts(rootElement) {
    rootElement.querySelectorAll(".tl-card-image").forEach((image) => {
      image.addEventListener("error", () => {
        const media = image.closest(".tl-card-media");
        const tag = media ? media.querySelector(".tl-card-tag") : null;

        image.hidden = true;

        if (tag) {
          tag.hidden = false;
        }
      });
    });

    rootElement.querySelectorAll(".tl-quiz").forEach((quiz) => {
      const correctAnswer = quiz.dataset.correctAnswer;
      const feedback = quiz.querySelector(".tl-quiz-feedback");

      const originalFeedback = feedback
        ? feedback.dataset.originalFeedback || feedback.textContent.trim()
        : "";

      quiz.querySelectorAll(".tl-quiz-option").forEach((button) => {
        button.addEventListener("click", () => {
          const selected = button.dataset.answer;
          const isCorrect = selected === correctAnswer;

          quiz.querySelectorAll(".tl-quiz-option").forEach((item) => {
            item.removeAttribute("aria-pressed");
            item.classList.remove("tl-quiz-option-correct");
            item.classList.remove("tl-quiz-option-wrong");
          });

          button.setAttribute("aria-pressed", "true");

          if (isCorrect) {
            button.classList.add("tl-quiz-option-correct");
          } else {
            button.classList.add("tl-quiz-option-wrong");
          }

          if (feedback) {
            feedback.hidden = false;

            feedback.classList.remove("tl-quiz-feedback-correct");
            feedback.classList.remove("tl-quiz-feedback-wrong");

            if (isCorrect) {
              feedback.classList.add("tl-quiz-feedback-correct");
              feedback.innerHTML = `Correct. ${renderInlineContent(originalFeedback)}`;
            } else {
              feedback.classList.add("tl-quiz-feedback-wrong");
              feedback.innerHTML = `Wrong answer. ${renderInlineContent(originalFeedback)}`;
            }
          }
        });
      });
    });
  }

  return {
    render,
    activateInteractiveParts
  };
})();