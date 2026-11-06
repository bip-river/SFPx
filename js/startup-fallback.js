// A classic script written for old browsers too, so it runs where app.js cannot. Without it, a page whose
// application failed to load still offers a "Start now" button that does nothing.
(function () {
  var root = document.documentElement;
  var MESSAGES = {
    failed: 'This page didn’t load properly, so you can’t start a permit right now. Reload the page to try again. If that doesn’t work, try another browser, or buy your permit at a local BWL office.',
    unsupported: 'This browser can’t run this service. Use an up-to-date browser, or buy your permit at a local BWL office.'
  };

  function fail(kind) {
    if (root.getAttribute('data-app-ready') === 'true' || root.getAttribute('data-startup-failed')) return;
    root.setAttribute('data-startup-failed', kind);
    var box = document.getElementById('startupError');
    var start = document.getElementById('startButton');
    var time = document.querySelector('.start-time');
    if (box) {
      box.querySelector('p').textContent = MESSAGES[kind];
      box.hidden = false;
    }
    if (start) start.hidden = true;
    if (time) time.hidden = true;
  }

  // Browsers without module support skip app.js entirely.
  if (!('noModule' in document.createElement('script'))) {
    fail('unsupported');
    return;
  }
  // app.js or a module it imports did not download.
  var app = document.querySelector('script[type="module"][src="app.js"]');
  if (app) app.addEventListener('error', function () { fail('failed'); });
  // app.js downloaded but stopped with an error before it was ready. Other origins' errors are not ours.
  window.addEventListener('error', function (event) {
    if (event.filename && event.filename.indexOf(location.origin + '/') === 0) fail('failed');
  });
  window.addEventListener('unhandledrejection', function () { fail('failed'); });
})();
