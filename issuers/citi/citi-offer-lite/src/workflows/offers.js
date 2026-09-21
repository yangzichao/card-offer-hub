async function enrollPlannedOffers() {
    ensureRunning();
    const queue = offerWorkflow.plan().map(record => record.source);
    state.confirmed = 0;
    state.completed = 0;
    state.total = queue.length;
    let unconfirmed = 0;
    let serverErrors = 0;
    let consecutiveServerErrors = 0;
    for (const offer of queue) {
        ensureRunning();
        updateStatus(`Adding ${state.completed + 1}/${state.total}: ${offer.merchant}…${unconfirmed ? ` ${unconfirmed} unconfirmed offer(s) skipped; continuing with the rest.` : ''}`);
        // A stop while waiting has not sent this offer. Keep it available, not unconfirmed.
        await waitForRequestSlot();
        try {
            const result = await attemptCitiEnrollment(offer);
            if (result.confirmed) state.confirmed++; else unconfirmed++;
            if (result.serverErrorStatus !== null) serverErrors++;
            consecutiveServerErrors = result.serverErrorStatus === null ? 0 : consecutiveServerErrors + 1;
            state.completed++;
            renderPanel();
            if (consecutiveServerErrors >= 3 && state.completed < state.total) {
                throw new Error(`Paused: Citi returned server errors for 3 offers in a row (latest HTTP ${result.serverErrorStatus}). ${state.confirmed} added; ${unconfirmed} unconfirmed; ${state.total - state.completed} not attempted. Progress saved. Use Add saved offers to continue later; unconfirmed offers will be skipped.`);
            }
        } catch (error) {
            if (offer.status !== 'ENROLLED') offer.status = 'UNCONFIRMED';
            throw error;
        }
    }
    ensureRunning();
    updateStatus(state.total ? `Finished: ${state.confirmed}/${state.total} offers added.${unconfirmed ? ` ${unconfirmed} unconfirmed offer(s) skipped; refresh to check their status.` : ''}${serverErrors ? ` Citi returned server errors for ${serverErrors} offer(s); none were retried.` : ''}` : 'Up to date. No new offers to add to your selected cards.');
}
