function ensureSelectedSession(accountId, { allowStopped = false } = {}) {
    if (!allowStopped) ensureRunning();
    if (!state.selected.has(accountId) || !state.accounts.some(card => card.accountId === accountId)) {
        throw new Error('Load your cards and choose at least one card first.');
    }
    if (currentSession().enterprisePartyIdentifier !== state.sessionIdentity) {
        throw new Error('Chase session changed. Use Refresh & add offers to reload your cards.');
    }
}
let chaseReadScope = null;
function ensureChaseReadSession(accountId, { allowStopped = false } = {}) {
    if (!chaseReadScope) {
        ensureSelectedSession(accountId, { allowStopped });
        return state.sessionIdentity;
    }
    if (!allowStopped) ensureRunning();
    if (!chaseReadScope.accountIds.has(accountId)
        || currentSession().enterprisePartyIdentifier !== chaseReadScope.identity) {
        throw new Error('Chase session changed. Refresh your cards and offers.');
    }
    return chaseReadScope.identity;
}
function requestJson(descriptor) {
    return sendRequest(() => {
        // Reads require selected cards or an explicit, bounded refresh scope.
        let parameters;
        try { parameters = JSON.parse(descriptor.headers['path-params']); }
        catch { throw new Error('Invalid Chase read request. Refresh your cards and offers.'); }
        const accountId = String(parameters.primaryDigitalAccountIdentifierList?.[0] ?? '');
        const identity = ensureChaseReadSession(accountId);
        const expected = buildOffersRequest(accountId);
        if (descriptor.method !== 'GET' || descriptor.path !== expected.path
            || JSON.stringify(descriptor.headers) !== JSON.stringify(expected.headers)) {
            throw new Error('Unsupported Chase read request.');
        }
        return { url: expected.path, options: {
            method: 'GET', credentials: 'same-origin', redirect: 'error',
            headers: { ...sessionHeaders(), ...expected.headers }
        }, validateResponse(payload) {
            ensureChaseReadSession(accountId, { allowStopped: true });
            normalizeOffers(payload, accountId, identity);
            return true;
        } };
    });
}
