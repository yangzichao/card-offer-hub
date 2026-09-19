async function scanCurrentAccount() {
    state.needsScan = true;
    state.offers = [];
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    updateStatus('Scanning current account offers…');
    const payload = await requestJson(SETTINGS.retrievePath);
    ensureRunning();
    state.offers = normalizeOffers(payload);
    state.needsScan = false;
    renderPanel();
}
function scanOffers() {
    return runExclusive(async () => {
        await scanCurrentAccount();
        updateStatus(`Scan complete: ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} eligible offers. Confirm the account scope before adding.`);
    });
}
function addAllOffers() {
    if (!state.accountConsent || state.needsScan) return;
    return runExclusive(async () => {
        // Check the current page token before any activation, then refresh the list.
        activationUrl();
        await scanCurrentAccount();
        const queue = state.offers.filter(offer => offer.status === 'AVAILABLE');
        state.total = queue.length;
        for (const offer of queue) {
            ensureRunning();
            updateStatus(`Activating ${state.completed + 1}/${state.total}: ${offer.merchant}. Waiting for the next request slot…`);
            try {
                const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
                if (!enrollmentConfirmed(payload)) throw new Error('Activation was not explicitly confirmed. Scan again before continuing.');
                offer.status = 'ACTIVATED';
                state.confirmed++;
                state.completed++;
                renderPanel();
            } catch (error) {
                offer.status = 'UNCONFIRMED';
                throw error;
            }
        }
        ensureRunning();
        updateStatus(`Finished: ${state.confirmed}/${state.total} confirmed. Refresh the Wells Fargo page to update its deal badges.`);
    });
}
