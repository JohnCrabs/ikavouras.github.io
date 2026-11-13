(function () {
  "use strict";

  var GREEK_MONTHS = [
    "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
    "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος"
  ];

  var DOW_LABELS = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];

  var STORAGE_KEY = "ts_timesheet_generator_v1";

  var PROFILE_FIELDS = ["surname", "firstname", "fatherCode", "projectId", "country", "wpCount", "selectedWPs"];

  // ---------- date helpers ----------

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function daysInMonth(year, month) {
    // month: 1-12
    return new Date(year, month, 0).getDate();
  }

  function weekdayMonFirst(year, month, day) {
    // 0 = Monday ... 6 = Sunday
    var jsDay = new Date(year, month - 1, day).getDay(); // 0=Sun..6=Sat
    return (jsDay + 6) % 7;
  }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function ddmmyyyy(year, month, day) {
    return pad2(day) + "-" + pad2(month) + "-" + year;
  }

  // Orthodox Easter (Meeus Julian algorithm), returned as a Gregorian Date (UTC)
  function orthodoxEaster(year) {
    var a = year % 4;
    var b = year % 7;
    var c = year % 19;
    var d = (19 * c + 15) % 30;
    var e = (2 * a + 4 * b - d + 34) % 7;
    var month = Math.floor((d + e + 114) / 31); // Julian month: 3=March, 4=April
    var day = ((d + e + 114) % 31) + 1;
    var julian = new Date(Date.UTC(year, month - 1, day));
    // Julian -> Gregorian offset is 13 days for 1900-2099
    julian.setUTCDate(julian.getUTCDate() + 13);
    return julian;
  }

  function addDaysUTC(date, n) {
    var d = new Date(date);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }

  function utcDateToKey(d) {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  // ---------- holidays ----------

  function getHolidays(country, year) {
    // returns Map<dateKey, name>
    var map = {};
    if (country === "NONE") return map;

    if (country === "GR") {
      var easter = orthodoxEaster(year);
      var items = [
        [new Date(Date.UTC(year, 0, 1)), "Πρωτοχρονιά"],
        [new Date(Date.UTC(year, 0, 6)), "Θεοφάνεια"],
        [addDaysUTC(easter, -48), "Καθαρά Δευτέρα"],
        [new Date(Date.UTC(year, 2, 25)), "25η Μαρτίου"],
        [addDaysUTC(easter, -2), "Μεγάλη Παρασκευή"],
        [addDaysUTC(easter, 1), "Δευτέρα του Πάσχα"],
        [new Date(Date.UTC(year, 4, 1)), "Εργατική Πρωτομαγιά"],
        [addDaysUTC(easter, 50), "Αγίου Πνεύματος"],
        [new Date(Date.UTC(year, 7, 15)), "Κοίμηση της Θεοτόκου"],
        [new Date(Date.UTC(year, 9, 28)), "28η Οκτωβρίου"],
        [new Date(Date.UTC(year, 11, 25)), "Χριστούγεννα"],
        [new Date(Date.UTC(year, 11, 26)), "Σύναξη της Θεοτόκου"]
      ];
      items.forEach(function (it) { map[utcDateToKey(it[0])] = it[1]; });
    }
    return map;
  }

  // ---------- state ----------

  var state = {
    surname: "",
    firstname: "",
    fatherCode: "",
    projectId: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    country: "GR",
    wpCount: 9,
    selectedWPs: {},     // { 1: true, 4: true }
    selectedDays: {},    // { 7: true, 12: true }  (day numbers of current month)
    hours: {}            // { wp: { day: hoursNumber } }
  };

  function loadPersisted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      PROFILE_FIELDS.forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
    } catch (e) { /* ignore corrupt storage */ }
  }

  function getProfileData() {
    var data = {};
    PROFILE_FIELDS.forEach(function (k) { data[k] = state[k]; });
    data.selectedWPs = Object.assign({}, state.selectedWPs);
    return data;
  }

  function savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getProfileData()));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  // ---------- DOM refs ----------

  var el = {};

  function cacheEls() {
    el.surname = document.getElementById("surname");
    el.firstname = document.getElementById("firstname");
    el.fatherCode = document.getElementById("fatherCode");
    el.projectId = document.getElementById("projectId");
    el.month = document.getElementById("month");
    el.year = document.getElementById("year");
    el.wpCount = document.getElementById("wpCount");
    el.wpCheckboxes = document.getElementById("wpCheckboxes");
    el.country = document.getElementById("country");
    el.calendar = document.getElementById("calendar");
    el.hoursArea = document.getElementById("hoursArea");
    el.summary = document.getElementById("summary");
    el.filenamePreview = document.getElementById("filenamePreview");
    el.btnGenerate = document.getElementById("btnGenerate");
    el.btnCopy = document.getElementById("btnCopy");
    el.btnResetMonth = document.getElementById("btnResetMonth");
    el.statusMsg = document.getElementById("statusMsg");
    el.csvPreview = document.getElementById("csvPreview");
    el.btnSaveProfile = document.getElementById("btnSaveProfile");
    el.btnLoadProfile = document.getElementById("btnLoadProfile");
    el.profileFileInput = document.getElementById("profileFileInput");
    el.profileStatusMsg = document.getElementById("profileStatusMsg");
  }

  // ---------- filename ----------

  function computeFilename() {
    var surname = (state.surname || "ΕΠΩΝΥΜΟ").trim().toUpperCase();
    var firstname = (state.firstname || "ΟΝΟΜΑ").trim().toUpperCase();
    var father = (state.fatherCode || "ΧΧΧ").trim().toUpperCase();
    var pid = (state.projectId || "ΚΩΔΙΚΟΣ").trim();
    var mm = pad2(state.month);
    return "TS_" + surname + "_" + firstname + "_" + father + "_" + pid + "_" + mm + "-" + state.year + ".csv";
  }

  function renderFilenamePreview() {
    el.filenamePreview.textContent = computeFilename();
  }

  // ---------- profile (save/load as a local JSON file) ----------

  function setProfileStatus(msg, kind) {
    el.profileStatusMsg.textContent = msg;
    el.profileStatusMsg.className = "status-msg" + (kind ? " " + kind : "");
  }

  function applyProfileData(data) {
    if (!data || typeof data !== "object") throw new Error("invalid profile data");

    if (typeof data.surname === "string") state.surname = data.surname;
    if (typeof data.firstname === "string") state.firstname = data.firstname;
    if (typeof data.fatherCode === "string") state.fatherCode = data.fatherCode.toUpperCase().slice(0, 3);
    if (typeof data.projectId === "string" || typeof data.projectId === "number") state.projectId = String(data.projectId);
    if (data.country === "GR" || data.country === "NONE") state.country = data.country;

    if (data.wpCount) {
      var n = parseInt(data.wpCount, 10);
      if (n >= 1 && n <= 30) state.wpCount = n;
    }

    state.selectedWPs = {};
    if (data.selectedWPs && typeof data.selectedWPs === "object") {
      Object.keys(data.selectedWPs).forEach(function (k) {
        var wp = parseInt(k, 10);
        if (data.selectedWPs[k] && wp >= 1 && wp <= state.wpCount) state.selectedWPs[wp] = true;
      });
    }

    // reflect the loaded profile into the step-1/2/3 inputs (month/year/days/hours are untouched)
    el.surname.value = state.surname;
    el.firstname.value = state.firstname;
    el.fatherCode.value = state.fatherCode;
    el.projectId.value = state.projectId;
    el.country.value = state.country;
    el.wpCount.value = state.wpCount;

    savePersisted();
    renderFilenamePreview();
    renderWPCheckboxes();
    renderCalendar();
    renderHoursArea();
    renderSummary();
  }

  function exportProfile() {
    var data = getProfileData();
    var json = JSON.stringify(data, null, 2);
    var pid = (state.projectId || "profile").trim().replace(/[^A-Za-z0-9_-]+/g, "_") || "profile";
    var filename = "profile_" + pid + ".json";

    var blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    setProfileStatus("Το προφίλ αποθηκεύτηκε στο αρχείο " + filename, "ok");
  }

  function importProfileFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        applyProfileData(data);
        setProfileStatus("Το προφίλ φορτώθηκε από το αρχείο " + file.name, "ok");
      } catch (e) {
        setProfileStatus("Το αρχείο δεν είναι έγκυρο αρχείο προφίλ JSON.", "err");
      }
    };
    reader.onerror = function () {
      setProfileStatus("Σφάλμα ανάγνωσης του αρχείου.", "err");
    };
    reader.readAsText(file);
  }

  function bindProfile() {
    el.btnSaveProfile.addEventListener("click", exportProfile);
    el.btnLoadProfile.addEventListener("click", function () {
      el.profileFileInput.value = "";
      el.profileFileInput.click();
    });
    el.profileFileInput.addEventListener("change", function () {
      importProfileFile(this.files && this.files[0]);
    });
  }

  // ---------- step 1 ----------

  function populateMonthSelect() {
    el.month.innerHTML = GREEK_MONTHS.map(function (name, idx) {
      return '<option value="' + (idx + 1) + '">' + name + '</option>';
    }).join("");
  }

  function bindStep1() {
    el.surname.value = state.surname;
    el.firstname.value = state.firstname;
    el.fatherCode.value = state.fatherCode;
    el.projectId.value = state.projectId;
    el.month.value = state.month;
    el.year.value = state.year;

    el.surname.addEventListener("input", function () {
      state.surname = this.value; renderFilenamePreview(); savePersisted();
    });
    el.firstname.addEventListener("input", function () {
      state.firstname = this.value; renderFilenamePreview(); savePersisted();
    });
    el.fatherCode.addEventListener("input", function () {
      this.value = this.value.toUpperCase().slice(0, 3);
      state.fatherCode = this.value; renderFilenamePreview(); savePersisted();
    });
    el.projectId.addEventListener("input", function () {
      state.projectId = this.value; renderFilenamePreview(); savePersisted();
    });
    el.month.addEventListener("change", function () {
      state.month = parseInt(this.value, 10);
      onMonthOrYearChanged();
    });
    el.year.addEventListener("change", function () {
      var y = parseInt(this.value, 10);
      if (!y || y < 2000) y = new Date().getFullYear();
      state.year = y;
      this.value = y;
      onMonthOrYearChanged();
    });
  }

  function onMonthOrYearChanged() {
    // new month => day selections and hours no longer meaningful
    state.selectedDays = {};
    state.hours = {};
    renderFilenamePreview();
    renderCalendar();
    renderHoursArea();
    renderSummary();
  }

  // ---------- step 2 : WPs ----------

  function renderWPCheckboxes() {
    var n = state.wpCount;
    var html = "";
    for (var i = 1; i <= n; i++) {
      var checked = !!state.selectedWPs[i];
      html += '<label class="wp-checkbox' + (checked ? " checked" : "") + '" data-wp="' + i + '">' +
        '<input type="checkbox" data-wp="' + i + '"' + (checked ? " checked" : "") + '> WP' + i +
        '</label>';
    }
    el.wpCheckboxes.innerHTML = html;

    Array.prototype.forEach.call(el.wpCheckboxes.querySelectorAll('input[type="checkbox"]'), function (cb) {
      cb.addEventListener("change", function () {
        var wp = parseInt(this.getAttribute("data-wp"), 10);
        if (this.checked) {
          state.selectedWPs[wp] = true;
        } else {
          delete state.selectedWPs[wp];
          if (state.hours[wp]) delete state.hours[wp];
        }
        this.closest(".wp-checkbox").classList.toggle("checked", this.checked);
        savePersisted();
        renderHoursArea();
        renderSummary();
      });
    });
  }

  function bindStep2() {
    el.wpCount.value = state.wpCount;
    el.wpCount.addEventListener("change", function () {
      var n = parseInt(this.value, 10);
      if (!n || n < 1) n = 1;
      if (n > 30) n = 30;
      this.value = n;
      state.wpCount = n;
      // drop selections / hours for WPs that no longer exist
      Object.keys(state.selectedWPs).forEach(function (k) {
        if (parseInt(k, 10) > n) delete state.selectedWPs[k];
      });
      Object.keys(state.hours).forEach(function (k) {
        if (parseInt(k, 10) > n) delete state.hours[k];
      });
      savePersisted();
      renderWPCheckboxes();
      renderHoursArea();
      renderSummary();
    });
  }

  // ---------- step 3 : calendar ----------

  function bindStep3() {
    el.country.value = state.country;
    el.country.addEventListener("change", function () {
      state.country = this.value;
      savePersisted();
      renderCalendar();
      renderSummary();
    });
  }

  function renderCalendar() {
    var year = state.year, month = state.month;
    var holidays = getHolidays(state.country, year);
    var totalDays = daysInMonth(year, month);
    var firstDow = weekdayMonFirst(year, month, 1);

    var html = DOW_LABELS.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join("");

    for (var i = 0; i < firstDow; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    for (var day = 1; day <= totalDays; day++) {
      var dow = weekdayMonFirst(year, month, day); // 5=Sat,6=Sun
      var isWeekend = (dow === 5 || dow === 6);
      var key = dateKey(year, month, day);
      var holidayName = holidays[key];
      var isHoliday = !!holidayName;
      var isSelected = !!state.selectedDays[day];

      var classes = ["cal-day"];
      if (isWeekend) classes.push("weekend");
      if (isHoliday) classes.push("holiday");
      if (isSelected && !isWeekend && !isHoliday) classes.push("selected");

      var title = isHoliday ? ' title="' + holidayName + '"' : "";
      html += '<div class="' + classes.join(" ") + '" data-day="' + day + '"' + title + '>' + day + '</div>';
    }

    el.calendar.innerHTML = html;

    Array.prototype.forEach.call(el.calendar.querySelectorAll(".cal-day:not(.empty):not(.weekend):not(.holiday)"), function (cell) {
      cell.addEventListener("click", function () {
        var day = parseInt(this.getAttribute("data-day"), 10);
        if (state.selectedDays[day]) {
          delete state.selectedDays[day];
        } else {
          state.selectedDays[day] = true;
        }
        this.classList.toggle("selected");
        renderHoursArea();
        renderSummary();
      });
    });
  }

  // ---------- step 4 : hours table ----------

  function getSelectedWPList() {
    return Object.keys(state.selectedWPs).map(Number).sort(function (a, b) { return a - b; });
  }

  function getSelectedDayList() {
    return Object.keys(state.selectedDays).map(Number).sort(function (a, b) { return a - b; });
  }

  function renderHoursArea() {
    var wps = getSelectedWPList();
    var days = getSelectedDayList();

    if (wps.length === 0) {
      el.hoursArea.innerHTML = '<p class="empty-note">Επίλεξε τουλάχιστον ένα WP στο βήμα 2.</p>';
      return;
    }
    if (days.length === 0) {
      el.hoursArea.innerHTML = '<p class="empty-note">Επίλεξε ημέρες στο ημερολόγιο του βήματος 3.</p>';
      return;
    }

    var html = '<div class="hours-table-wrap"><table class="hours-table"><thead><tr><th>Ημέρα</th>';
    wps.forEach(function (wp) { html += "<th>WP" + wp + "</th>"; });
    html += "</tr></thead><tbody>";

    html += '<tr class="quickfill-row"><td>Γρήγορη συμπλήρωση</td>';
    wps.forEach(function (wp) {
      html += '<td>' +
        '<input type="number" min="0" step="0.5" class="quickfill-input" data-wp="' + wp + '" placeholder="ώρες" style="width:56px;"><br>' +
        '<button type="button" class="quickfill-btn" data-wp="' + wp + '">Εφαρμογή σε όλες</button>' +
        '</td>';
    });
    html += "</tr>";

    days.forEach(function (day) {
      html += "<tr><td>" + pad2(day) + "-" + pad2(state.month) + "-" + state.year + "</td>";
      wps.forEach(function (wp) {
        var val = (state.hours[wp] && state.hours[wp][day] !== undefined) ? state.hours[wp][day] : "";
        html += '<td><input type="number" min="0" step="0.5" class="hour-input" data-wp="' + wp + '" data-day="' + day + '" value="' + val + '"></td>';
      });
      html += "</tr>";
    });

    html += "</tbody></table></div>";
    el.hoursArea.innerHTML = html;

    Array.prototype.forEach.call(el.hoursArea.querySelectorAll(".hour-input"), function (input) {
      input.addEventListener("input", function () {
        var wp = parseInt(this.getAttribute("data-wp"), 10);
        var day = parseInt(this.getAttribute("data-day"), 10);
        var val = parseFloat(this.value);
        if (!state.hours[wp]) state.hours[wp] = {};
        if (isNaN(val) || val <= 0) {
          delete state.hours[wp][day];
        } else {
          state.hours[wp][day] = val;
        }
        renderSummary();
      });
    });

    Array.prototype.forEach.call(el.hoursArea.querySelectorAll(".quickfill-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var wp = parseInt(this.getAttribute("data-wp"), 10);
        var input = el.hoursArea.querySelector('.quickfill-input[data-wp="' + wp + '"]');
        var val = parseFloat(input.value);
        if (isNaN(val) || val <= 0) return;
        if (!state.hours[wp]) state.hours[wp] = {};
        days.forEach(function (day) { state.hours[wp][day] = val; });
        renderHoursArea();
        renderSummary();
      });
    });
  }

  // ---------- step 5 : summary + CSV ----------

  function buildCsv() {
    var year = state.year, month = state.month;
    var totalDays = daysInMonth(year, month);
    var n = state.wpCount;
    var lines = ["day,wp,hours"];

    for (var day = 1; day <= totalDays; day++) {
      var dateStr = ddmmyyyy(year, month, day);
      for (var wp = 1; wp <= n; wp++) {
        var hours = (state.selectedWPs[wp] && state.hours[wp] && state.hours[wp][day]) ? state.hours[wp][day] : 0;
        lines.push(dateStr + ",WP" + wp + "," + hours);
      }
    }
    return lines.join("\n");
  }

  function renderSummary() {
    var wps = getSelectedWPList();
    var totalByWp = {};
    var grandTotal = 0;
    wps.forEach(function (wp) {
      var sum = 0;
      if (state.hours[wp]) {
        Object.keys(state.hours[wp]).forEach(function (day) { sum += state.hours[wp][day]; });
      }
      totalByWp[wp] = sum;
      grandTotal += sum;
    });

    var html = '<div class="summary-item"><div class="label">Επιλεγμένα WPs</div><div class="value">' + (wps.length || "-") + "</div></div>";
    html += '<div class="summary-item"><div class="label">Ημέρες με ώρες</div><div class="value">' + getSelectedDayList().length + "</div></div>";
    html += '<div class="summary-item"><div class="label">Σύνολο ωρών</div><div class="value">' + grandTotal + "</div></div>";
    wps.forEach(function (wp) {
      html += '<div class="summary-item"><div class="label">WP' + wp + "</div><div class=\"value\">" + totalByWp[wp] + "</div></div>";
    });
    el.summary.innerHTML = html;
  }

  function setStatus(msg, kind) {
    el.statusMsg.textContent = msg;
    el.statusMsg.className = "status-msg" + (kind ? " " + kind : "");
  }

  function validateBeforeExport() {
    if (!state.surname.trim() || !state.firstname.trim() || !state.fatherCode.trim() || !state.projectId.trim()) {
      return "Συμπλήρωσε επώνυμο, όνομα, πατρώνυμο και κωδικό έργου στο βήμα 1.";
    }
    if (state.fatherCode.trim().length !== 3) {
      return "Το πατρώνυμο πρέπει να έχει ακριβώς 3 γράμματα.";
    }
    if (getSelectedWPList().length === 0) {
      return "Επίλεξε τουλάχιστον ένα WP στο βήμα 2.";
    }
    return null;
  }

  function downloadCsv() {
    var err = validateBeforeExport();
    if (err) { setStatus(err, "err"); return; }

    var csv = buildCsv();
    var filename = computeFilename();
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    setStatus("Έγινε λήψη του αρχείου " + filename, "ok");
  }

  function copyCsvToClipboard() {
    var csv = buildCsv();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).then(function () {
        setStatus("Το περιεχόμενο αντιγράφηκε στο clipboard.", "ok");
      }, function () {
        setStatus("Η αντιγραφή απέτυχε. Χρησιμοποίησε την προεπισκόπηση παρακάτω.", "err");
      });
    } else {
      setStatus("Η αντιγραφή δεν υποστηρίζεται. Χρησιμοποίησε την προεπισκόπηση παρακάτω.", "err");
    }
  }

  function bindStep5() {
    el.btnGenerate.addEventListener("click", downloadCsv);
    el.btnCopy.addEventListener("click", copyCsvToClipboard);
    el.btnResetMonth.addEventListener("click", function () {
      state.selectedDays = {};
      state.hours = {};
      renderCalendar();
      renderHoursArea();
      renderSummary();
      setStatus("Οι ημέρες και οι ώρες του μήνα καθαρίστηκαν.", "ok");
    });

    var detailsEl = document.querySelector(".preview-details");
    detailsEl.addEventListener("toggle", function () {
      if (detailsEl.open) el.csvPreview.value = buildCsv();
    });
  }

  // periodically keep the live preview in sync if it's open
  function refreshPreviewIfOpen() {
    var detailsEl = document.querySelector(".preview-details");
    if (detailsEl && detailsEl.open) el.csvPreview.value = buildCsv();
  }

  // ---------- init ----------

  function init() {
    cacheEls();
    loadPersisted();
    populateMonthSelect();

    el.month.value = state.month;
    el.year.value = state.year;

    bindProfile();
    bindStep1();
    bindStep2();
    bindStep3();
    bindStep5();

    renderFilenamePreview();
    renderWPCheckboxes();
    renderCalendar();
    renderHoursArea();
    renderSummary();

    // keep CSV preview live
    el.hoursArea.addEventListener("input", refreshPreviewIfOpen);
    el.calendar.addEventListener("click", refreshPreviewIfOpen);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
