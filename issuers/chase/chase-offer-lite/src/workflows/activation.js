function addAllOffers() {
    return runExclusive(async () => {
        if (state.needsScan || state.restoredWorkspace) throw new Error('Scan offers before adding.');
        const planned = offerWorkflow.plan().map(record => record.source);
        if (!planned.length && chaseUnsupportedClickCount()) throw new Error('Chase click details are missing or changed. Scan again or add these offers on Chase.');
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
            if (!offer) throw new Error('Chase offer disappeared. Scan offers again before adding.');
            updateStatus(`Adding offer ${state.completed + 1}/${state.total}…`);
            await sendChaseOfferClick(offer);
            ensureSelectedSession(offer.accountId);
            const payload = await requestJson(buildOffersRequest(offer.accountId));
            ensureSelectedSession(offer.accountId, { allowStopped: true });
            const refreshed = normalizeOffers(payload, offer.accountId, state.sessionIdentity);
            const confirmed = refreshed.find(candidate => candidate.offerId === offer.offerId && candidate.status === 'ACTIVATED');
            if (!confirmed) throw new Error('Chase did not confirm this offer as added. Scan again to verify; no click was retried.');
            state.offers = state.offers.filter(candidate => candidate.accountId !== offer.accountId).concat(refreshed);
            finishWorkspaceOffer(confirmed);
            state.confirmed++;
            state.completed++;
            renderPanel();
            ensureRunning();
        }
        updateStatus(`Finished: ${state.confirmed} offers confirmed added.${chaseUnsupportedClickNotice()}`);
    }, 'add');
}
