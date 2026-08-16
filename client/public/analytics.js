// Google Analytics 4 initialisation — external file so the CSP script-src
// can drop 'unsafe-inline'. Loaded synchronously BEFORE the gtag.js loader
// so the ga-disable flag is set before GA boots.
window['ga-disable-G-5BRC2FMPNT'] = true;

window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-5BRC2FMPNT', { anonymize_ip: true, send_page_view: false });

// Re-enable if user already consented
try {
  var _c = JSON.parse(localStorage.getItem('forma-cookie-consent') || 'null');
  if (_c && _c.statistics === true) {
    window['ga-disable-G-5BRC2FMPNT'] = false;
    gtag('event', 'page_view');
  }
} catch(e) {}
