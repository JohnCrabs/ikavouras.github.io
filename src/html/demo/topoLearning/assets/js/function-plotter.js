const TLXPlotPlayground = (() => {
  function normalizeExpression(expression) {
    let cleaned = String(expression || "").trim();

    if (cleaned.includes("=")) {
      cleaned = cleaned.split("=").slice(1).join("=").trim();
    }

    cleaned = cleaned
      .replaceAll("π", "pi")
      .replaceAll("^", "**")
      .replace(/\bln\s*\(/gi, "log(")
      .replace(/\bpi\b/gi, "PI")
      .replace(/\be\b/g, "E");

    return cleaned;
  }

  function compileExpression(expression) {
    const cleaned = normalizeExpression(expression);

    const isSafe = /^[0-9xX+\-*/().,\sA-Za-z_]+$/.test(cleaned);

    if (!isSafe) {
      throw new Error(`Μη αποδεκτή έκφραση: ${expression}`);
    }

    return new Function(
      "x",
      `
        const {
          sin, cos, tan, asin, acos, atan,
          sinh, cosh, tanh,
          exp, log, log10, sqrt, abs,
          floor, ceil, round, pow,
          min, max
        } = Math;

        const PI = Math.PI;
        const E = Math.E;

        return ${cleaned};
      `
    );
  }

  function getCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(360, Math.floor(rect.width || 700));
    const height = 380;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return {
      ctx,
      width,
      height
    };
  }

  function drawGrid(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d8e2d8";

    for (let i = 0; i <= 10; i += 1) {
      const x = (width / 10) * i;
      const y = (height / 10) * i;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawAxes(ctx, width, height, xMin, xMax, yMin, yMax) {
    const toCanvasX = (x) => ((x - xMin) / (xMax - xMin)) * width;
    const toCanvasY = (y) => height - ((y - yMin) / (yMax - yMin)) * height;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#064d25";

    if (xMin <= 0 && xMax >= 0) {
      const x0 = toCanvasX(0);
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, height);
      ctx.stroke();
    }

    if (yMin <= 0 && yMax >= 0) {
      const y0 = toCanvasY(0);
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(width, y0);
      ctx.stroke();
    }
  }

  function drawFunction(ctx, fn, width, height, xMin, xMax, yMin, yMax, color) {
    const toCanvasY = (y) => height - ((y - yMin) / (yMax - yMin)) * height;

    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();

    let started = false;

    for (let px = 0; px <= width; px += 1) {
      const x = xMin + (px / width) * (xMax - xMin);
      let y;

      try {
        y = fn(x);
      } catch (error) {
        started = false;
        continue;
      }

      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }

      const cy = toCanvasY(y);

      if (cy < -height || cy > height * 2) {
        started = false;
        continue;
      }

      if (!started) {
        ctx.moveTo(px, cy);
        started = true;
      } else {
        ctx.lineTo(px, cy);
      }
    }

    ctx.stroke();
  }

  function getAxisValue(root, axisName, fallback) {
    const input = root.querySelector(`[data-axis="${axisName}"]`);
    const value = input ? Number(input.value) : fallback;

    return Number.isFinite(value)
      ? value
      : fallback;
  }

  function setMessage(root, message, type = "info") {
    const messageElement = root.querySelector(".tl-plot-message");

    if (!messageElement) {
      return;
    }

    messageElement.textContent = message || "";
    messageElement.dataset.type = type;
  }

  function renderOne(root) {
    const textarea = root.querySelector(".tl-plot-functions, textarea");
    const canvas = root.querySelector(".tl-plot-canvas, canvas");

    if (!textarea || !canvas) {
      return;
    }

    const xMin = getAxisValue(root, "xmin", -5);
    const xMax = getAxisValue(root, "xmax", 5);
    const yMin = getAxisValue(root, "ymin", -5);
    const yMax = getAxisValue(root, "ymax", 5);

    if (xMin >= xMax || yMin >= yMax) {
      setMessage(root, "Έλεγξε τα όρια των αξόνων.", "error");
      return;
    }

    const { ctx, width, height } = getCanvasSize(canvas);

    drawGrid(ctx, width, height);
    drawAxes(ctx, width, height, xMin, xMax, yMin, yMax);

    const expressions = textarea.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const colors = ["#138a3d", "#f57c00", "#064d25", "#8a1f11", "#3a5fcd", "#7a3e9d"];

    let plottedCount = 0;
    const errors = [];

    expressions.forEach((expression, index) => {
      try {
        const fn = compileExpression(expression);
        drawFunction(ctx, fn, width, height, xMin, xMax, yMin, yMax, colors[index % colors.length]);
        plottedCount += 1;
      } catch (error) {
        errors.push(expression);
      }
    });

    if (errors.length > 0) {
      setMessage(root, `Δεν σχεδιάστηκαν: ${errors.join(", ")}`, "error");
    } else {
      setMessage(root, plottedCount > 0 ? `Σχεδιάστηκαν ${plottedCount} συνάρτηση/συναρτήσεις.` : "", "info");
    }
  }

  function activateOne(root) {
    const button = root.querySelector(".tl-plot-update, button");

    if (button) {
      button.addEventListener("click", () => {
        renderOne(root);
      });
    }

    window.addEventListener("resize", () => {
      renderOne(root);
    });

    renderOne(root);
  }

  function activateAll(rootElement) {
    rootElement.querySelectorAll(".tl-plot-playground").forEach(activateOne);
  }

  return {
    activateAll
  };
})();

window.TLXPlotPlayground = TLXPlotPlayground;
