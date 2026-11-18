// Boot: apply theme, load Monaco (local vendor copy if present, else CDN), then start the app.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('cdev.theme') || '"dark"');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) { /* ignore */ }

  var CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
  var LOCAL = new URL('vendor/monaco/vs', location.href).href;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function start(base) {
    var isCross = new URL(base).origin !== location.origin;
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        if (!isCross) return base + '/base/worker/workerMain.js';
        var code = "self.MonacoEnvironment={baseUrl:'" + base.replace(/vs$/, '') + "'};importScripts('" + base + "/base/worker/workerMain.js');";
        return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code);
      }
    };
    window.CDEV_MONACO_BASE = base;
    return loadScript(base + '/loader.js').then(function () {
      window.require.config({ paths: { vs: base } });
      return new Promise(function (res, rej) { window.require(['vs/editor/editor.main'], res, rej); });
    });
  }

  fetch(LOCAL + '/loader.js', { method: 'HEAD' })
    .then(function (r) { return r.ok ? LOCAL : CDN; }, function () { return CDN; })
    .then(start)
    .then(function () { return import('./main.js'); })
    .catch(function (e) {
      console.error(e);
      var b = document.getElementById('boot');
      if (b) b.innerHTML = '<div><b>Could not load the editor.</b><br>' +
        'Check your internet connection, or run <code>python runner/vendor_monaco.py</code> once for offline use.<br><small>' +
        String(e && e.message || e) + '</small></div>';
    });
})();
