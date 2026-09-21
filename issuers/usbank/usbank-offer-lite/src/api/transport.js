async function requestGraphql(query, variablesFactory, session, verifyListing = () => true) {
    if (![LIST_OFFERS_QUERY, ACTIVATE_OFFER_QUERY].includes(query)) throw new Error('Unsupported US Bank operation.');
    return sendRequest(() => {
        ensureSameSession(session);
        return { url: SETTINGS.endpoint, options: {
            method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            headers: sessionHeaders(), body: JSON.stringify({ query, variables: variablesFactory() })
        }, validateResponse(payload) {
            ensureSameSession(session);
            if (query === ACTIVATE_OFFER_QUERY) return activationAcknowledged(payload) ? undefined : false;
            return verifyListing(normalizeListing(payload));
        } };
    });
}
