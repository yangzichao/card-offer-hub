async function enrollPlannedOffers() {
    ensureRunning();
    const queue = offerWorkflow.plan().map(record => record.source);
    state.confirmed = 0;
    state.completed = 0;
    state.total = queue.length;
    for (const offer of queue) {
        ensureRunning();
        updateStatus(`Adding ${state.completed + 1}/${state.total}: ${offer.merchant}…`);
        // A stop while waiting has not sent this offer. Keep it available, not unconfirmed.
        await waitForRequestSlot();
        try {
            offerWorkflow.assertAction(offer);
            markWorkspaceOfferPending(offer);
            const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
            if (!enrollmentConfirmed(payload, offer)) throw new Error('Enrollment was not explicitly confirmed. Use Refresh & add offers to check before continuing.');
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
    updateStatus(state.total ? `Finished: ${state.confirmed}/${state.total} offers added.` : 'Up to date. No new offers to add to your selected cards.');
}
