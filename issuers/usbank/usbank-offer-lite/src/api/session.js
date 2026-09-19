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
function sessionHeaders() {
    return {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'application-id': 'web', 'service-version': '2', refreshcache: 'false',
        routingkey: '', 'correlation-id': crypto.randomUUID()
    };
}
