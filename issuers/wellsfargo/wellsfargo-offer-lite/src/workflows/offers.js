async function scanCurrentAccount() {
    state.needsScan = true;
    bindWorkspaceScope(await workspaceScopeFingerprint(activationUrl()));
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    updateStatus('Scanning current account offers…');
    const payload = await requestJson(SETTINGS.retrievePath);
    ensureRunning();
    state.offers = normalizeOffers(payload);
    state.needsScan = false;
    recordWorkspaceScan();
    renderPanel();
}
function scanOffers() {
    return runExclusive(async () => {
        await scanCurrentAccount();
        updateStatus(`Scan complete: ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} eligible offers. Confirm the account scope before adding.`);
    });
}
// The account list is the only read that shows an offer's activation state.
async function readWellsFargoOfferStatus(offer) {
    updateStatus(`Checking ${offer.merchant} with Wells Fargo…`);
    const fresh = normalizeOffers(await requestJson(SETTINGS.retrievePath)).find(item => item.offerId === offer.offerId);
    ensureRunning();
    offer.status = fresh ? fresh.status : 'UNSUPPORTED';
    return offer.status === 'ACTIVATED' ? 'added' : offer.status === 'AVAILABLE' ? 'available' : 'unavailable';
}
// One offer never ends the run. A missing SUCCESS is checked against the account
// list; an offer that is still available is sent once more, then skipped.
function addAllOffers() {
    if (!state.accountConsent || state.needsScan) return;
    return runExclusive(async () => {
        // Check the current page token before any activation, then refresh the list.
        activationUrl();
        await scanCurrentAccount();
        if (!state.accountConsent) throw new Error('The signed-in account session changed. Confirm account activation again.');
        const queue = offerWorkflow.plan().map(record => record.source);
        state.total = queue.length;
        const tally = createHubOfferRunTally(queue.length);
        for (const offer of queue) {
            ensureRunning();
            let sent = false;
            const { outcome } = await hubAttemptOffer({
                initialStatus: 'available',
                readStatus: () => readWellsFargoOfferStatus(offer),
                async send() {
                    updateStatus(`Activating ${tally.processed + 1}/${state.total}: ${offer.merchant}. Waiting for the next request slot…${tally.progressNote()}`);
                    offerWorkflow.assertAction(offer);
                    markWorkspaceOfferPending(offer);
                    sent = true;
                    const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
                    return enrollmentConfirmed(payload);
                }
            }).catch(error => {
                // Stop, sign-in or rate limits end the run; a sent write stays unconfirmed.
                if (sent && offer.status !== 'ACTIVATED') offer.status = 'UNCONFIRMED';
                throw error;
            });
            if (outcome === 'added') { offer.status = 'ACTIVATED'; state.confirmed++; }
            if (outcome === 'unconfirmed') offer.status = 'UNCONFIRMED';
            state.completed++;
            if (sent && outcome !== 'unconfirmed') finishWorkspaceOffer(offer);
            renderPanel();
            if (tally.record(outcome, offer.merchant)) {
                updateStatus(tally.pauseMessage());
                return;
            }
        }
        ensureRunning();
        updateStatus(`Finished: ${tally.summary()} Refresh the Wells Fargo page to update its deal badges.`);
    }, 'add');
}
