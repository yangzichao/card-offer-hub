async function requestJson(path, body) {
    if (![SETTINGS.retrievePath, SETTINGS.enrollmentPath].includes(path)) throw new Error('Unsupported Wells Fargo endpoint.');
    return sendRequest(async () => {
        const enrollment = path === SETTINGS.enrollmentPath;
        const url = enrollment ? activationUrl() : path;
        if (enrollment && state.workspaceScope && await workspaceScopeFingerprint(url) !== state.workspaceScope) {
            state.accountConsent = false;
            throw new Error('The signed-in account session changed. Scan and confirm account activation again.');
        }
        const headers = { Accept: 'application/json' };
        if (enrollment) headers['Content-Type'] = 'application/json';
        return { url, options: {
            method: enrollment ? 'POST' : 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            headers, ...(enrollment ? { body: JSON.stringify(body) } : {})
        } };
    });
}
