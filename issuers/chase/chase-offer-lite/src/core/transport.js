function ensureSelectedSession(accountId, { allowStopped = false } = {}) {
    if (!allowStopped) ensureRunning();
    if (!state.selected.has(accountId) || !state.accounts.some(card => card.accountId === accountId)) {
        throw new Error('Select a detected card before scanning.');
    }
    if (currentSession().enterprisePartyIdentifier !== state.sessionIdentity) {
        throw new Error('Chase session changed. Detect cards and select them again.');
    }
}
function requestJson(descriptor) {
    return sendRequest(() => {
        // Only a freshly constructed selected-account read is accepted.
        let parameters;
        try { parameters = JSON.parse(descriptor.headers['path-params']); }
        catch { throw new Error('Invalid Chase read request. Detect cards again.'); }
        const accountId = String(parameters.primaryDigitalAccountIdentifierList?.[0] ?? '');
        ensureSelectedSession(accountId);
        const expected = buildOffersRequest(accountId);
        if (descriptor.method !== 'GET' || descriptor.path !== expected.path
            || JSON.stringify(descriptor.headers) !== JSON.stringify(expected.headers)) {
            throw new Error('Unsupported Chase read request.');
        }
        return { url: expected.path, options: {
            method: 'GET', credentials: 'same-origin', redirect: 'error',
            headers: { ...sessionHeaders(), ...expected.headers }
        }, validateResponse(payload) {
            ensureSelectedSession(accountId, { allowStopped: true });
            normalizeOffers(payload, accountId, state.sessionIdentity);
            return true;
        } };
    });
}
