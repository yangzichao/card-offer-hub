function currentSessionToken() {
    let token;
    let claims;
    try {
        token = new URLSearchParams(location.search).get('token') || localStorage.getItem('LS_TOKEN');
        if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error('Missing token');
        const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    } catch { throw new Error('No readable Deals session. Sign in through Bank of America and scan again.'); }
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) {
        throw new Error('Deals session expired. Sign in again.');
    }
    // This adapter implements the observed modern API, not /api-legacy.
    if (claims.featureFlags?.dxlEnabled !== true) throw new Error('This Deals session does not use the supported modern API.');
    return token;
}
