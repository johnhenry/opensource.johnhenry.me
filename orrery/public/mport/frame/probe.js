// The No-bundler frame's first script: a classic, external file (the frame's policy has no 'unsafe-inline'), loaded BEFORE the
// inline import map so it is listening when the browser decides whether the map's hash is allowed. It reports to the planet:
// every Content-Security-Policy violation, every script that failed to load (a module refused for its integrity, a 404 from a
// dead mirror), and uncaught errors (a bare import with no import map to resolve it). Nothing here touches an HTML sink.
(function () {
  'use strict';
  function post(message) {
    // the frame is a srcdoc document of the planet's own origin; the planet checks event.source, so '*' leaks nothing
    try { parent.postMessage({ mportFrame: message }, '*'); } catch (e) { /* the planet went away */ }
  }
  document.addEventListener('securitypolicyviolation', function (e) {
    post({ type: 'violation', directive: e.effectiveDirective || e.violatedDirective, sample: String(e.sample || '').slice(0, 90), blocked: String(e.blockedURI || '') });
  });
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) post({ type: 'load-error', tag: String(t.tagName).toLowerCase(), src: String(t.src || t.href || '') });
    else post({ type: 'error', message: String(e.message || (e.error && e.error.message) || 'error').slice(0, 240) });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    post({ type: 'error', message: String((r && r.message) || r).slice(0, 240) });
  });
  window.addEventListener('load', function () { post({ type: 'load' }); });
  post({ type: 'probe' });
})();
