function addAllOffers() {
    return runExclusive(async () => {
        if (state.needsScan || state.restoredWorkspace) throw new Error('Scan offers before adding.');
        await enrollPlannedChaseOffers();
    }, 'add');
}
async function enrollPlannedChaseOffers({ savedScope = false } = {}) {
    const planned = offerWorkflow.plan().map(record => record.source);
    if (!planned.length && chaseUnsupportedClickCount()) throw new Error('Chase click details are missing or changed. Use Refresh & add offers, or add these offers on Chase.');
    // Reject incomplete runtime credentials before any clicks leave.
    planned.forEach(buildChaseClickRequest);
    state.confirmed = 0;
    state.completed = 0;
    state.total = planned.length;
    for (const target of planned) {
        ensureSelectedSession(target.accountId);
        // Verification refreshes this card's records and click tokens.
        const offer = state.offers.find(candidate => candidate.accountId === target.accountId && candidate.offerId === target.offerId);
        if (offer?.status === 'ACTIVATED') { state.completed++; continue; }
        if (!offer) throw new Error('Chase offer disappeared. Use Refresh & add offers to check current offers.');
        updateStatus(`Adding offer ${state.completed + 1}/${state.total}…`);
        await sendChaseOfferClick(offer);
        ensureSelectedSession(offer.accountId);
        const payload = await requestJson(buildOffersRequest(offer.accountId));
        ensureSelectedSession(offer.accountId, { allowStopped: true });
        const refreshed = normalizeOffers(payload, offer.accountId, state.sessionIdentity);
        const confirmed = refreshed.find(candidate => candidate.offerId === offer.offerId && candidate.status === 'ACTIVATED');
        if (!confirmed) throw new Error('Chase did not confirm this offer as added. Add saved offers can continue the remaining offers. Use Refresh & add offers to check this offer; no click was retried.');
        state.offers = savedScope ? reconcileChaseSavedOffers(refreshed, new Set([offer.accountId]))
            : state.offers.filter(candidate => candidate.accountId !== offer.accountId).concat(refreshed);
        finishWorkspaceOffer(confirmed);
        state.confirmed++;
        state.completed++;
        renderPanel();
        ensureRunning();
    }
    updateStatus(`Finished: ${state.confirmed} offers confirmed added.${chaseUnsupportedClickNotice()}`);
}
