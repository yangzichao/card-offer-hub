function sendChaseOfferClick(offer) {
    return sendRequest(() => {
        // Recheck after waiting for pacing, immediately before sending.
        offerWorkflow.assertAction(offer);
        const url = buildChaseClickRequest(offer);
        offer.status = 'UNCONFIRMED';
        markWorkspaceOfferPending(offer);
        return {
            url, allowEmptyResponse: true,
            options: { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store',
                referrerPolicy: 'strict-origin-when-cross-origin', headers: { Accept: '*/*' } },
            validateResponse() {
                ensureSelectedSession(offer.accountId, { allowStopped: true });
                // Empty HTTP 200 is only acknowledgement, never enrollment proof.
            }
        };
    });
}
