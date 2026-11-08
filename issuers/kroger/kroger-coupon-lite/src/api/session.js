// Kroger's page sends store and modality context with every savings request.
// Those values are not readable from page storage, so the observer copies this
// allowlist from the page's own requests. They live in memory only.
const KROGER_CONTEXT_HEADER_NAMES = ['x-kroger-channel', 'x-modality', 'x-modality-type', 'x-facility-id', 'x-laf-object', 'x-ab-test'];
const KROGER_REQUIRED_HEADER_NAMES = ['x-kroger-channel', 'x-modality', 'x-laf-object'];
let krogerCapturedContext = null;
function krogerReadHeaders(input) {
    const headers = {};
    if (input && typeof input.forEach === 'function' && !Array.isArray(input)) {
        input.forEach((value, name) => { headers[String(name).toLowerCase()] = String(value); });
    } else if (Array.isArray(input)) {
        for (const [name, value] of input) headers[String(name).toLowerCase()] = String(value);
    } else if (input && typeof input === 'object') {
        for (const [name, value] of Object.entries(input)) headers[name.toLowerCase()] = String(value);
    }
    return headers;
}
function captureKrogerContext(requestUrl, requestHeaders) {
    try {
        const url = new URL(requestUrl, SETTINGS.origin);
        if (url.origin !== SETTINGS.origin || !url.pathname.startsWith('/atlas/v1/')) return false;
        const headers = krogerReadHeaders(requestHeaders);
        if (headers['x-kroger-channel'] !== 'WEB') return false;
        const captured = {};
        for (const name of KROGER_CONTEXT_HEADER_NAMES) {
            const value = headers[name];
            if (typeof value === 'string' && value && value.length <= 8192 && !/[\r\n]/.test(value)) captured[name] = value;
        }
        if (!KROGER_REQUIRED_HEADER_NAMES.every(name => captured[name])) return false;
        krogerCapturedContext = { headers: captured, capturedAt: Date.now() };
        return true;
    } catch { return false; }
}
function krogerContextHeaders() {
    if (!krogerCapturedContext) {
        throw new Error('Wait for Kroger Coupons to finish loading, then try again. Reload the Coupons page if needed.');
    }
    return {
        Accept: 'application/json, text/plain, */*', ...krogerCapturedContext.headers,
        'x-call-origin': '{"page":"coupon","component":"coupons"}'
    };
}
// The signed-in Kroger account key. Read on a user action, compared in memory,
// and persisted only as a SHA-256 fingerprint.
function readKrogerAccountKey() {
    try {
        const keys = JSON.parse(localStorage.getItem('msal.2.account.keys'));
        if (Array.isArray(keys) && keys.length === 1 && typeof keys[0] === 'string' && keys[0].trim()) return keys[0];
    } catch { /* Fall through to the sign-in message. */ }
    throw new Error('Sign in to Kroger, open Coupons, then try again.');
}
function ensureSameKrogerAccount(expectedAccountKey) {
    if (readKrogerAccountKey() !== expectedAccountKey) {
        throw new Error('Kroger account changed. Reload Coupons and click Clip all coupons again.');
    }
}
