function requiredSessionString(value) {
    return typeof value === 'string' && value.trim() && !['undefined', 'null'].includes(value);
}
function readSession() {
    // These keys and field mappings come from the bank's captured application.
    // Read only on a user action. Never import credentials from a HAR.
    try {
        const hub = JSON.parse(sessionStorage.getItem('offerhubobject'));
        const session = {
            sourceApplication: hub?.platformKeyVal, sourceCustomerId: hub?.sourceCustomerId,
            userId: sessionStorage.getItem('userId'), sessionTokenId: hub?.securityToken
        };
        if (session.sourceApplication !== 'OLB' || !Object.values(session).every(requiredSessionString)) throw new Error();
        return session;
    } catch {
        throw new Error('Cash Back Deals session is unavailable. Open the bank’s deals page after signing in, then scan again.');
    }
}
function ensureSameSession(expected) {
    const current = readSession();
    if (!expected || Object.keys(current).some(key => current[key] !== expected[key])) {
        state.selected.clear();
        state.offers = [];
        throw new Error('Bank session changed. Scan and select offers again.');
    }
}
// The bank's own GraphQL client sends this sign-in token as a Bearer header.
// The page may refresh it, so read it for every request; never store or compare it.
function readAccessToken() {
    const token = sessionStorage.getItem('AccessToken');
    if (!requiredSessionString(token)) throw new Error('US Bank sign-in token is unavailable. Reload Cash Back Deals after signing in, then scan again.');
    return token;
}
function sessionHeaders() {
    return {
        Accept: 'application/json', 'Content-Type': 'application/json',
        authorization: `Bearer ${readAccessToken()}`,
        'application-id': 'web', 'service-version': '2', refreshcache: 'false',
        routingkey: '', 'correlation-id': crypto.randomUUID()
    };
}
