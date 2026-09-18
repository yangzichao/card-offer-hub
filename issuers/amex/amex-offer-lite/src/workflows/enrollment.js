// Adds every planned offer in one unattended run: one request at a time, the
// minimum gap between them, no retries, and a stop that takes effect immediately.
async function startEnrollment(groupKey = null) {
    if (state.busy || Date.now() < state.cooldownUntil) return;
    const plan = enrollmentPlan(groupKey);
    if (!plan.length) return;
    state.busy = 'enroll';
    state.cancelRequested = false;
    render();
    let addedCount = 0;
    try {
        log(`Adding ${plan.length} offers one at a time via ${CARD_ENROLLMENT_ENDPOINT}, `
            + `${SETTINGS.requestGapMs / 1000}s apart, across ${new Set(plan.map(({ account }) => account.token)).size} cards.`);
        for (const plannedOffer of plan) {
            await enrollPlannedOffer(plannedOffer);
            addedCount++;
        }
        setStatus(`Enrollment complete. ${addedCount} offers added.`);
    } catch (error) {
        setStatus(`${error.message} ${addedCount} offers added.`);
    } finally {
        state.busy = null;
        state.cancelRequested = false;
        render();
    }
}
