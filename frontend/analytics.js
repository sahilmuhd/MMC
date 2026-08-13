// Loads Plausible Analytics only if MMC_ANALYTICS_DOMAIN is set in config.js.
// No script is injected and no request is made when it's left blank —
// analytics are fully opt-in.
//
// Why Plausible: no cookies, no personal data collection, no consent
// banner required in most jurisdictions (including under GDPR). Swap the
// script src below if you'd rather use Fathom or another cookie-free
// provider — the gate on MMC_ANALYTICS_DOMAIN still applies.
(function () {
  var domain = window.MMC_ANALYTICS_DOMAIN;
  if (!domain) return;

  var script = document.createElement("script");
  script.defer = true;
  script.setAttribute("data-domain", domain);
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
})();
