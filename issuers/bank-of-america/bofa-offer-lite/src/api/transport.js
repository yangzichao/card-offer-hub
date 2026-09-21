async function requestJson(path, method = 'POST', body) {
    const allowed = (path === '/geo' && method === 'GET')
        || (['/api/offers-search', '/api/offers-details'].includes(path) && method === 'POST')
        || (/^\/api\/activate-offer\/\d+$/.test(path) && method === 'PUT' && body === undefined);
    if (!allowed) throw new Error('Unsupported Deals request.');
    return sendRequest(() => {
        const headers = path === '/geo' ? {} : { 'X-Cardholder-Token': state.sessionToken };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return { url: path, options: {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin', redirect: 'error'
        } };
    });
}
