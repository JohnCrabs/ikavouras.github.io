(function () {
  const canvas = document.getElementById("geometryCanvas");
  const info = document.getElementById("geometryInfo");
  const toolPoint = document.getElementById("toolPoint");
  const toolLine = document.getElementById("toolLine");
  const toolPolygon = document.getElementById("toolPolygon");
  const toolClear = document.getElementById("toolClear");

  if (!canvas || !info) {
    return;
  }

  const ctx = canvas.getContext("2d");

  let activeTool = "point";
  let points = [];

  function setActiveTool(tool) {
    activeTool = tool;

    toolPoint.className = tool === "point" ? "btn btn-primary" : "btn btn-outline-primary";
    toolLine.className = tool === "line" ? "btn btn-primary" : "btn btn-outline-primary";
    toolPolygon.className = tool === "polygon" ? "btn btn-primary" : "btn btn-outline-primary";
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#dee2e6";

    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#adb5bd";

    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
  }

  function drawPoints() {
    points.forEach(function (point, index) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#0d6efd";
      ctx.fill();

      ctx.fillStyle = "#212529";
      ctx.font = "14px Arial";
      ctx.fillText("P" + (index + 1), point.x + 8, point.y - 8);
    });
  }

  function drawLineSegments() {
    if (activeTool !== "line" && activeTool !== "polygon") {
      return;
    }

    if (points.length < 2) {
      return;
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#198754";

    if (activeTool === "line") {
      for (let i = 0; i < points.length - 1; i += 2) {
        const p1 = points[i];
        const p2 = points[i + 1];

        if (!p2) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    if (activeTool === "polygon") {
      ctx.beginPath();

      points.forEach(function (point, index) {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      if (points.length > 2) {
        ctx.closePath();
      }

      ctx.stroke();
    }
  }

  function updateInfo() {
    if (points.length === 0) {
      info.textContent = "Δεν έχουν προστεθεί σημεία.";
      return;
    }

    let text = "Σημεία: " + points.length;

    if (points.length >= 2) {
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];
      const distance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

      text += "\\nΤελευταία απόσταση: " + distance.toFixed(2) + " px";
    }

    if (activeTool === "polygon" && points.length >= 3) {
      text += "\\nΕμβαδόν πολυγώνου: " + calculatePolygonArea().toFixed(2) + " px²";
    }

    info.innerText = text;
  }

  function calculatePolygonArea() {
    let areaSum = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      areaSum += p1.x * p2.y - p1.y * p2.x;
    }

    return Math.abs(areaSum) / 2;
  }

  function redraw() {
    drawGrid();
    drawLineSegments();
    drawPoints();
    updateInfo();
  }

  canvas.addEventListener("click", function (event) {
    const point = getCanvasPoint(event);

    points.push(point);
    redraw();
  });

  toolPoint.addEventListener("click", function () {
    points = [];
    setActiveTool("point");
    redraw();
  });

  toolLine.addEventListener("click", function () {
    points = [];
    setActiveTool("line");
    redraw();
  });

  toolPolygon.addEventListener("click", function () {
    points = [];
    setActiveTool("polygon");
    redraw();
  });

  toolClear.addEventListener("click", function () {
    points = [];
    redraw();
  });

  setActiveTool("point");
  redraw();
})();