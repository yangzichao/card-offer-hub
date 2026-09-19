async function fetchListing(session) {
    const payload = await requestGraphql(LIST_OFFERS_QUERY, () => ({ request: session }), session);
    return normalizeListing(payload);
}
function scanOffers() {
    return runExclusive(async () => {
        state.needsScan = true;
        state.offers = [];
        state.selected.clear();
        state.confirmed = 0;
        state.total = 0;
        state.session = readSession();
        updateStatus('Scanning Cash Back Deals…');
        const listing = await fetchListing(state.session);
        ensureRunning();
        state.offers = listing.offers;
        state.needsScan = false;
        updateStatus(`Scan complete: ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} available. Select offers to activate.`);
    });
}
function activateSelectedOffers() {
    if (state.needsScan || !state.selected.size) return;
    const selectedIds = [...state.selected];
    return runExclusive(async () => {
        ensureSameSession(state.session);
        state.needsScan = true;
        state.confirmed = 0;
        state.total = selectedIds.length;
        updateStatus('Refreshing selected offers before activation…');
        let listing = await fetchListing(state.session);
        state.offers = listing.offers;
        for (const offerId of selectedIds) {
            ensureRunning();
            const offer = listing.offers.find(item => item.offerId === offerId);
            if (offer?.status === 'ACTIVATED') { state.selected.delete(offerId); continue; }
            if (!offer || offer.status !== 'AVAILABLE') throw new Error('A selected offer changed or disappeared. Scan and select again.');
            updateStatus(`Activating ${offer.merchant}; each request waits ${SETTINGS.gapMilliseconds / 1000} seconds after the previous response…`);
            try {
                const payload = await requestGraphql(ACTIVATE_OFFER_QUERY, () => activationBody(offer, listing), state.session);
                offer.status = 'UNCONFIRMED';
                if (!activationAcknowledged(payload)) throw new Error('Activation was not acknowledged. Scan again; no automatic retry.');
                updateStatus(`Verifying ${offer.merchant} with US Bank…`);
                // An acknowledgement is not success. One read-back is allowed;
                // a missing/unchanged result stops the entire queue, without polling.
                const verified = await fetchListing(state.session);
                if (!activationConfirmed(verified, offerId)) throw new Error('Activation was not explicitly confirmed. Scan again before continuing.');
                listing = verified;
                state.offers = listing.offers;
                state.confirmed++;
                state.selected.delete(offerId);
                renderPanel();
            } catch (error) {
                offer.status = 'UNCONFIRMED';
                throw error;
            }
        }
        ensureRunning();
        // Every new run requires a fresh manual scan and selection.
        updateStatus(`Finished: ${state.confirmed}/${state.total} newly confirmed. Already activated offers were skipped. Scan again for a new selection.`);
    });
}
