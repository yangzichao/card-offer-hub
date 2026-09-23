function updateEnrollmentStatus(account, offer, status) {
    offer.status = status;
    // Duplicate tiles for the same card/offer must not stay eligible after adding.
    for (const equivalent of state.offersByAccount.get(account.token) || []) {
        if (equivalent.groupKey === offer.groupKey) equivalent.status = status;
    }
}

// One offer, one card, one request slot. The slot enforces the minimum gap from
// the previous response, so nothing overlaps and nothing retries on its own.
// Resolves with the status of every HTTP 200 answer, including a declined or
// unconfirmed one; the caller decides whether the run continues. Transport
// failures (HTTP errors, 429, timeouts, Stop) still reject.
function enrollPlannedOffer({ account, offer }) {
    return withRequestSlot(async observe => {
        assertWhitelisted(account.token);
        offerWorkflow.assertAction(offer);
        if (offer.status !== 'ELIGIBLE' || !offer.enrollable || !state.scanReports.get(account.token)?.startsWith('Complete')) {
            throw new Error('This offer is no longer eligible on the chosen card. Scan again.');
        }
        setStatus(`Adding ${offer.name} to ${account.cardName}.`);
        const pendingKey = enrollmentStorageKey(account.token, offer.groupKey);
        state.pendingEnrollments.add(pendingKey);
        // A reload cannot tell whether an in-flight enrollment succeeded, so the
        // uncertainty is saved before the request leaves.
        if (!persistOfferResults()) {
            state.pendingEnrollments.delete(pendingKey);
            throw new Error('Could not save pending enrollment state. No enrollment request was sent.');
        }
        try {
            const status = await sendEnrollmentRequest(account.token, offer.id, observe);
            updateEnrollmentStatus(account, offer, status);
            return status;
        } catch (error) {
            if (offer.status === 'ELIGIBLE' && !(error instanceof RateLimited) && !(error instanceof RequestStopped)) {
                updateEnrollmentStatus(account, offer, 'UNCONFIRMED');
            }
            log(`${account.cardName}: ${error.message}`);
            throw error;
        } finally {
            state.pendingEnrollments.delete(pendingKey);
            persistOfferResults();
            render();
        }
    });
}
