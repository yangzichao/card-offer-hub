function addAllOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length || (state.needsScan && !canContinueSavedOffers())) return;
    return runExclusive(async () => {
        await scanCardOffers(accounts);
        const queue = state.offers.filter(offer => state.selected.has(offer.accountId) && offer.status === 'AVAILABLE');
        state.total = queue.length;
        for (const offer of queue) {
            ensureRunning();
            updateStatus(`Adding ${state.completed + 1}/${state.total}: ${offer.merchant}. Waiting for the next request slot…`);
            try {
                markWorkspaceOfferPending(offer);
                const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
                if (!enrollmentConfirmed(payload, offer)) throw new Error('Enrollment was not explicitly confirmed. Scan again before continuing.');
                offer.status = 'ENROLLED';
                state.confirmed++;
                state.completed++;
                finishWorkspaceOffer(offer);
                renderPanel();
            } catch (error) {
                if (offer.status !== 'ENROLLED') offer.status = 'UNCONFIRMED';
                throw error;
            }
        }
        ensureRunning();
        updateStatus(`Finished: ${state.confirmed}/${state.total} confirmed. Refresh Citi's page to update its offer badges.`);
    }, 'add');
}
