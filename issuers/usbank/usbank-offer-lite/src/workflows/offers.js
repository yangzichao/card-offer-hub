async function fetchListing(session, expectedActivatedId = null) {
    const payload = await requestGraphql(LIST_OFFERS_QUERY, () => ({ request: session }), session,
        listing => expectedActivatedId === null || activationConfirmed(listing, expectedActivatedId));
    return normalizeListing(payload);
}
function scanOffers() {
    return runExclusive(async () => {
        state.needsScan = true;
        state.confirmed = 0;
        state.total = 0;
        state.session = readSession();
        bindWorkspaceScope(await workspaceScopeFingerprint(JSON.stringify([state.session.sourceCustomerId, state.session.userId])));
        updateStatus('Scanning Cash Back Deals…');
        const listing = await fetchListing(state.session);
        ensureRunning();
        state.offers = listing.offers;
        state.selected = new Set([...state.selected].filter(id => state.offers.some(offer => offer.offerId === id && offer.status === 'AVAILABLE')));
        state.needsScan = false;
        recordWorkspaceScan();
        updateStatus(`Scan complete: ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} available. Select offers to activate.`);
    });
}
function activateSelectedOffers() {
    if (state.needsScan || !state.selected.size) return;
    return activateOfferIds(offerWorkflow.plan().filter(record => state.selected.has(record.offerId)).map(record => record.offerId));
}
function addAllOffers() {
    if (state.needsScan) return;
    return activateOfferIds(offerWorkflow.plan().map(record => record.offerId));
}
// Selections may only name offers that are still available in the latest listing.
function applyUsbankListing(listing) {
    state.offers = listing.offers;
    state.selected = new Set([...state.selected].filter(id => listing.offers.some(offer => offer.offerId === id && offer.status === 'AVAILABLE')));
}
function usbankOfferStatus(listing, offerId) {
    const offer = listing.offers.find(item => item.offerId === offerId);
    return offer?.status === 'ACTIVATED' ? 'added' : offer?.status === 'AVAILABLE' ? 'available' : 'unavailable';
}
// A GraphQL error on one activation is that offer's answer, not a broken session.
function usbankActivationFailure(error) {
    return hubOfferScopedWriteError(error) || error?.name === 'UsBankGraphqlError';
}
// One offer never ends the run. An activation is verified with one listing read;
// an offer that is still available after that is sent once more, then skipped.
function activateOfferIds(selectedIds) {
    if (!selectedIds.length) return;
    return runExclusive(async () => {
        ensureSameSession(state.session);
        state.needsScan = true;
        state.confirmed = 0;
        state.completed = 0;
        state.total = selectedIds.length;
        const tally = createHubOfferRunTally(selectedIds.length);
        updateStatus('Refreshing selected offers before activation…');
        let listing = await fetchListing(state.session);
        state.offers = listing.offers;
        state.selected = new Set([...state.selected].filter(id => listing.offers.some(offer => offer.offerId === id)));
        for (const offerId of selectedIds) {
            ensureRunning();
            const merchant = listing.offers.find(item => item.offerId === offerId)?.merchant || 'Offer';
            let sentOffer = null;
            const { outcome } = await hubAttemptOffer({
                initialStatus: usbankOfferStatus(listing, offerId),
                isWriteFailure: usbankActivationFailure,
                async readStatus() {
                    updateStatus(`Verifying ${merchant} with US Bank…`);
                    listing = await fetchListing(state.session, offerId);
                    ensureRunning();
                    applyUsbankListing(listing);
                    return usbankOfferStatus(listing, offerId);
                },
                async send() {
                    const offer = listing.offers.find(item => item.offerId === offerId);
                    updateStatus(`Activating ${tally.processed + 1}/${selectedIds.length}: ${merchant}…${tally.progressNote()}`);
                    offerWorkflow.assertAction(offer);
                    markWorkspaceOfferPending(offer);
                    sentOffer = offer;
                    // An acknowledgement is not success; the listing read decides.
                    await requestGraphql(ACTIVATE_OFFER_QUERY, () => activationBody(offer, listing), state.session);
                    offer.status = 'UNCONFIRMED';
                    return false;
                }
            }).catch(error => {
                // Stop, sign-in or rate limits end the run; a sent write stays unconfirmed.
                const current = state.offers.find(item => item.offerId === offerId);
                if (sentOffer && current && current.status !== 'ACTIVATED') current.status = 'UNCONFIRMED';
                throw error;
            });
            const current = state.offers.find(item => item.offerId === offerId);
            if (current && outcome === 'unconfirmed') current.status = 'UNCONFIRMED';
            if (outcome === 'added') state.confirmed++;
            state.completed++;
            if (sentOffer && outcome !== 'unconfirmed') finishWorkspaceOffer(sentOffer);
            renderPanel();
            if (tally.record(outcome, merchant)) {
                state.needsScan = false;
                updateStatus(tally.pauseMessage());
                return;
            }
        }
        ensureRunning();
        // Each offer was refreshed from US Bank, so Add can run again without a scan.
        state.needsScan = false;
        updateStatus(`Finished: ${tally.summary()}`);
    }, 'add');
}
