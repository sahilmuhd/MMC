// Points the frontend at the backend API.
// Local dev: leave as-is (assumes backend running on localhost:4000).
// Production: change this to your deployed backend URL,
// e.g. "https://api.mmc-group.com"
window.MMC_API_BASE = "http://localhost:8000";

// Optional analytics. Leave blank to keep analytics fully disabled (default).
// To enable Plausible (cookie-free, no consent banner needed in most
// jurisdictions), set this to your site's domain as registered in Plausible,
// e.g. "mmc-group.com". analytics.js checks this value and only loads the
// tracking script when it's set — nothing is loaded or sent otherwise.
window.MMC_ANALYTICS_DOMAIN = "";
