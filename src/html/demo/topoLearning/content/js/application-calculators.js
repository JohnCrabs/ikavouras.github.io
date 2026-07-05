(function () {
  function getNumberValue(id) {
    const element = document.getElementById(id);
    if (!element) return null;
    const value = Number(element.value);
    return Number.isNaN(value) ? null : value;
  }

  function setResult(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.className = isError ? "alert alert-danger mt-3 mb-0" : "alert alert-secondary mt-3 mb-0";
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "-";
    return Number(value.toFixed(6)).toString();
  }

  function toRadians(value, unit) {
    if (unit === "rad") return value;
    if (unit === "deg") return value * Math.PI / 180;
    if (unit === "grad") return value * Math.PI / 200;
    return null;
  }

  function fromRadians(value, unit) {
    if (unit === "rad") return value;
    if (unit === "deg") return value * 180 / Math.PI;
    if (unit === "grad") return value * 200 / Math.PI;
    return null;
  }

  function setupDistanceCalculator() {
    const button = document.getElementById("calculateDistance");
    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const x1 = getNumberValue("distanceX1");
      const y1 = getNumberValue("distanceY1");
      const x2 = getNumberValue("distanceX2");
      const y2 = getNumberValue("distanceY2");
      if ([x1, y1, x2, y2].includes(null)) {
        setResult("distanceResult", "Σφάλμα: Όλες οι τιμές πρέπει να είναι αριθμοί.", true);
        return;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const d = Math.sqrt(dx ** 2 + dy ** 2);
      setResult("distanceResult", "d(A,B) = √((" + formatNumber(dx) + ")² + (" + formatNumber(dy) + ")²) = " + formatNumber(d));
    });
    button.click();
  }

  function setupSlopeCalculator() {
    const button = document.getElementById("calculateSlope");
    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const x1 = getNumberValue("slopeX1");
      const y1 = getNumberValue("slopeY1");
      const x2 = getNumberValue("slopeX2");
      const y2 = getNumberValue("slopeY2");
      if ([x1, y1, x2, y2].includes(null)) {
        setResult("slopeResult", "Σφάλμα: Όλες οι τιμές πρέπει να είναι αριθμοί.", true);
        return;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (dx === 0) {
        setResult("slopeResult", "Η ευθεία είναι κατακόρυφη: x = " + formatNumber(x1) + ". Η κλίση δεν ορίζεται.", true);
        return;
      }
      const a = dy / dx;
      const b = y1 - a * x1;
      setResult("slopeResult", "α = Δy / Δx = " + formatNumber(dy) + " / " + formatNumber(dx) + " = " + formatNumber(a) + " | Εξίσωση: y = " + formatNumber(a) + "x + " + formatNumber(b));
    });
    button.click();
  }

  function setupAngleConversionCalculator() {
    const button = document.getElementById("calculateAngleConversion");
    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const value = getNumberValue("angleValue");
      const from = document.getElementById("angleFrom").value;
      const to = document.getElementById("angleTo").value;
      if (value === null) {
        setResult("angleConversionResult", "Σφάλμα: Η τιμή της γωνίας πρέπει να είναι αριθμός.", true);
        return;
      }
      const radians = toRadians(value, from);
      const converted = fromRadians(radians, to);
      setResult("angleConversionResult", value + " " + from + " = " + formatNumber(converted) + " " + to);
    });
    button.click();
  }

  function setupTrigCalculator() {
    const button = document.getElementById("calculateTrig");
    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const value = getNumberValue("trigAngleValue");
      const unit = document.getElementById("trigAngleUnit").value;
      if (value === null) {
        setResult("trigResult", "Σφάλμα: Η τιμή της γωνίας πρέπει να είναι αριθμός.", true);
        return;
      }
      const radians = toRadians(value, unit);
      const sine = Math.sin(radians);
      const cosine = Math.cos(radians);
      const tangent = Math.abs(cosine) < 1e-12 ? null : Math.tan(radians);
      let message = "sinθ = " + formatNumber(sine) + " | cosθ = " + formatNumber(cosine) + " | ";
      message += tangent === null ? "tanθ δεν ορίζεται, επειδή cosθ ≈ 0" : "tanθ = " + formatNumber(tangent);
      setResult("trigResult", message);
    });
    button.click();
  }

  function setupCosLawCalculator() {
    const button = document.getElementById("calculateCosLaw");
    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const b = getNumberValue("cosLawB");
      const c = getNumberValue("cosLawC");
      const angleDeg = getNumberValue("cosLawA");
      if ([b, c, angleDeg].includes(null)) {
        setResult("cosLawResult", "Σφάλμα: Όλες οι τιμές πρέπει να είναι αριθμοί.", true);
        return;
      }
      if (b <= 0 || c <= 0) {
        setResult("cosLawResult", "Σφάλμα: Οι πλευρές πρέπει να είναι θετικοί αριθμοί.", true);
        return;
      }
      const angleRad = toRadians(angleDeg, "deg");
      const aSquared = b ** 2 + c ** 2 - 2 * b * c * Math.cos(angleRad);
      if (aSquared < 0 && Math.abs(aSquared) > 1e-10) {
        setResult("cosLawResult", "Σφάλμα: Οι τιμές δεν οδηγούν σε πραγματική πλευρά.", true);
        return;
      }
      const a = Math.sqrt(Math.max(0, aSquared));
      setResult("cosLawResult", "a² = " + formatNumber(aSquared) + " | a = " + formatNumber(a));
    });
    button.click();
  }

  function parsePolygonPoints(text) {
    const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
    const points = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length !== 2) return null;
      const x = Number(parts[0].trim());
      const y = Number(parts[1].trim());
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      points.push({ x, y });
    }
    return points;
  }

  function calculateShoelaceArea(points) {
    let areaSum = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      areaSum += p1.x * p2.y - p1.y * p2.x;
    }
    return Math.abs(areaSum) / 2;
  }

  function setupPolygonAreaCalculator() {
    const button = document.getElementById("calculatePolygonArea");
    const input = document.getElementById("polygonPointsInput");
    if (!button || !input || button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", function () {
      const points = parsePolygonPoints(input.value);
      if (!points) {
        setResult("polygonAreaResult", "Σφάλμα: Κάθε γραμμή πρέπει να έχει τη μορφή x,y.", true);
        return;
      }
      if (points.length < 3) {
        setResult("polygonAreaResult", "Σφάλμα: Ένα πολύγωνο χρειάζεται τουλάχιστον τρία σημεία.", true);
        return;
      }
      const area = calculateShoelaceArea(points);
      setResult("polygonAreaResult", "Εμβαδόν πολυγώνου = " + formatNumber(area));
    });
    button.click();
  }

  setupDistanceCalculator();
  setupSlopeCalculator();
  setupAngleConversionCalculator();
  setupTrigCalculator();
  setupCosLawCalculator();
  setupPolygonAreaCalculator();
})();
