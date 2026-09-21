async function scanOffers() {
    return runExclusive(async () => {
        state.needsScan = true;

        state.confirmed = 0;
        state.total = 0;
        state.sessionToken = currentSessionToken();
        bindWorkspaceScope(await workspaceScopeFingerprint(state.sessionToken));
        updateStatus('Reading current Deals location…');
        state.proximity = normalizeLocation(await requestJson('/geo', 'GET'));
        const collected = new Map();
        let expectedTotal = null;
        for (let offset = 0; ; offset += SETTINGS.pageSize) {
            updateStatus(`Scanning offers: ${collected.size} loaded…`);
            const page = normalizePage(await requestJson('/api/offers-search', 'POST', {
                apply_filter: {}, proximity_target: state.proximity, sort_by: 'merchant_name_asc',
                page_size: SETTINGS.pageSize, page_offset: offset
            }));
            ensureRunning();
            if (expectedTotal !== null && expectedTotal !== page.total) throw new Error('Offer list changed during pagination. Scan again.');
            expectedTotal = page.total;
            for (const offer of page.offers) {
                if (collected.has(offer.id)) throw new Error('Repeated offer during pagination. Scan again.');
                collected.set(offer.id, offer);
            }
            if (collected.size > expectedTotal) throw new Error('Inconsistent offer count. Scan again.');
            if (collected.size === expectedTotal) break;
            if (page.offers.length !== SETTINGS.pageSize) throw new Error('Incomplete offer page. Scan again.');
        }
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
async function activateOffers() {
    if (state.needsScan || !state.consent) return;
    return runExclusive(async () => {
        ensureRunning();
        const queue = offerWorkflow.plan().map(record => record.source);
        state.total = queue.length;
        state.needsScan = true;
        state.confirmed = 0;
        for (const offer of queue) {
            updateStatus(`Checking offer ${state.confirmed + 1}/${queue.length}…`);
            const current = await fetchOfferDetail(offer.id);
            ensureRunning();
            if (!current.eligible) {
                Object.assign(offer, current);
                throw new Error('Offer eligibility changed since scanning. Scan again before continuing.');
            }
            offerWorkflow.assertAction(offer);
            offer.result = 'Unconfirmed';
            markWorkspaceOfferPending(offer);
            updateStatus(`Activating offer ${state.confirmed + 1}/${queue.length}…`);
            const result = await requestJson(`/api/activate-offer/${offer.id}`, 'PUT');
            if (result?.ok !== true) throw new Error('Activation not explicitly confirmed. Scan again.');
            updateStatus('Activation accepted; verifying saved state…');
            const verified = await fetchOfferDetail(offer.id, true);
            ensureRunning();
            if (!verified.activated) throw new Error('Activation readback is unconfirmed. Scan again.');
            Object.assign(offer, verified, { result: 'Confirmed' });
            state.confirmed++;
            finishWorkspaceOffer(offer);
        }
        updateStatus(`Finished: ${state.confirmed}/${queue.length} activations confirmed by readback. Scan again to refresh.`);
    }, 'add');
}
