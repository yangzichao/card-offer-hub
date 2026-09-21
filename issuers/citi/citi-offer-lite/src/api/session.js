function readCookie(cookieName) {
    const prefix = `${cookieName}=`;
    const entry = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    if (!entry) return '';
    try { return decodeURIComponent(entry.slice(prefix.length)); } catch { return ''; }
}
function sessionHeaders() {
    // Citi's establishCookiePackage writes these routing values on sign-in.
    // Read current values for each request, never copy a HAR's session values.
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json', environmentID: 'SuperMarioPROD' };
    for (const name of ['appVersion', 'businessCode', 'channelId', 'client_id', 'countryCode']) {
        const value = readCookie(name);
        if (!value || value === 'undefined' || value === 'null') {
            throw new Error('Citi session configuration is unavailable. Open Merchant Offers after signing in, then use Refresh & add offers.');
        }
        headers[name] = value;
    }
    const sessionId = readCookie('tmx_sessionid');
    if (!sessionId) throw new Error('Citi session is not ready. Open Merchant Offers and use Refresh & add offers.');
    headers.TMXSessionId = sessionId;
    const xsrfToken = readCookie('XSRF-TOKEN');
    if (xsrfToken) headers['X-XSRF-TOKEN'] = xsrfToken;
    return headers;
}
