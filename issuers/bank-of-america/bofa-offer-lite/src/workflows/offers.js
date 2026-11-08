async function scanOffers() {
    return runExclusive(async () => {
        state.needsScan = true;

        state.confirmed = 0;
        state.total = 0;
        state.sessionToken = currentSessionToken();
        bindWorkspaceScope(await workspaceScopeFingerprint(state.sessionToken));
        updateStatus('Reading current Deals location…');
        state.proximity = normalizeLocation(await requestJson('/geo', 'GET'));
        // Deals recomputes `total` on every page (observed 841, 843, 840, 831, 843
        // on consecutive pages), so it is only a hint. Page until a short page,
        // and drop repeats caused by the list shifting between pages.
        const collected = new Map();
        let largestReportedTotal = 0;
        const maximumPages = Math.ceil(10000 / SETTINGS.pageSize) + 1;
        for (let pageIndex = 0; ; pageIndex++) {
            if (pageIndex >= maximumPages) throw new Error('Deals kept returning offers past its limit. Scan again.');
            updateStatus(`Scanning offers: ${collected.size} loaded…`);
            const page = normalizePage(await requestJson('/api/offers-search', 'POST', {
                apply_filter: {}, proximity_target: state.proximity, sort_by: 'merchant_name_asc',
                page_size: SETTINGS.pageSize, page_offset: pageIndex * SETTINGS.pageSize
            }));
            ensureRunning();
            largestReportedTotal = Math.max(largestReportedTotal, page.total);
            for (const offer of page.offers) if (!collected.has(offer.id)) collected.set(offer.id, offer);
            if (page.offers.length < SETTINGS.pageSize) break;
        }
        if (!collected.size && largestReportedTotal > 0) throw new Error('Deals reported offers but returned none. Scan again.');
        state.offers = [...collected.values()];
        state.needsScan = false;
        recordWorkspaceScan();
        const available = state.offers.filter(offer => offer.eligible).length;
        updateStatus(`Scan complete: ${available} eligible, ${state.offers.length - available} skipped. Upside offers are excluded.`);
    });
}
async function fetchOfferDetail(id, requireActivated = false) {
    return normalizeDetail(await requestJson('/api/offers-details', 'POST', {
        offer_id: id, proximity_target: state.proximity
    }, detail => requireActivated ? detail.activated : detail.eligible), id);
}
// The details read is the explicit answer: activated, still eligible, or not.
async function readBofaOfferStatus(offer) {
    const current = await fetchOfferDetail(offer.id, offer.result === 'Unconfirmed');
    ensureRunning();
    const status = current.activated ? 'added' : current.eligible ? 'available' : 'unavailable';
    // Still eligible and not activated settles an unclear write: nothing changed.
    Object.assign(offer, current, { result: status === 'available' ? '' : offer.result });
    return status;
}
// One offer never ends the run. Each is checked first, the write is verified by
// reading it back, and an offer still eligible after that is sent once more.
async function activateOffers() {
    if (state.needsScan || !state.consent) return;
    return runExclusive(async () => {
        ensureRunning();
        const queue = offerWorkflow.plan().map(record => record.source);
        const tally = createHubOfferRunTally(queue.length);
        state.total = queue.length;
        state.needsScan = true;
        state.confirmed = 0;
        state.completed = 0;
        for (const offer of queue) {
            const position = `${tally.processed + 1}/${queue.length}`;
            updateStatus(`Checking offer ${position}: ${offer.name}…${tally.progressNote()}`);
            const { outcome } = await hubAttemptOffer({
                readStatus: () => readBofaOfferStatus(offer),
                async send() {
                    offerWorkflow.assertAction(offer);
                    offer.result = 'Unconfirmed';
                    markWorkspaceOfferPending(offer);
                    updateStatus(`Activating offer ${position}: ${offer.name}…${tally.progressNote()}`);
                    // An acknowledgement is not success; the read-back decides.
                    await requestJson(`/api/activate-offer/${offer.id}`, 'PUT');
                    ensureRunning();
                    updateStatus(`Verifying offer ${position}: ${offer.name}…`);
                    return false;
                }
            });
            offer.result = { added: 'Confirmed', 'already-added': 'Confirmed', unavailable: '',
                'not-added': 'Not added', unconfirmed: 'Unconfirmed', 'check-failed': 'Not added' }[outcome];
            if (outcome === 'added') state.confirmed++;
            state.completed++;
            if (offer.result !== 'Unconfirmed') finishWorkspaceOffer(offer);
            renderPanel();
            if (tally.record(outcome, offer.name)) {
                state.needsScan = false;
                updateStatus(tally.pauseMessage());
                return;
            }
        }
        // Every offer was re-checked against Deals, so Add can run again without a scan.
        state.needsScan = false;
        updateStatus(`Finished: ${tally.summary()}`);
    }, 'add');
}
