async function requestJson(path, body) {
    if (![SETTINGS.retrievePath, SETTINGS.enrollmentPath].includes(path)) throw new Error('Unsupported Citi endpoint.');
    return sendRequest(() => ({ url: SETTINGS.apiBase + path, options: {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: sessionHeaders(), body: JSON.stringify(body)
    }, validateResponse(payload) {
        if (path === SETTINGS.enrollmentPath) return enrollmentConfirmed(payload, body);
        if (body?.accountId) normalizeOffers(payload, body.accountId); else normalizeAccounts(payload);
        return true;
    } }));
}
