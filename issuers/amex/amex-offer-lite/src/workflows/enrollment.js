// Adds every planned offer in one unattended run: one request at a time, the
// minimum gap between them, no retries, and a stop that takes effect immediately.
async function startEnrollment(groupKey = null) {
    if (!SETTINGS.capabilities.activation || state.busy || Date.now() < state.cooldownUntil) return;
    const plan = enrollmentPlan(groupKey, { forExecution: true });
    if (!plan.length) return;
    state.enrollmentProgress = { total: plan.length, completed: 0 };
    let addedCount = 0;
    return runAmexAction('enroll', async () => {
        log(`Adding ${plan.length} offers one at a time via ${CARD_ENROLLMENT_ENDPOINT}, `
            + `${SETTINGS.requestGapMs / 1000}s apart, across ${new Set(plan.map(({ account }) => account.token)).size} cards.`);
        for (const plannedOffer of plan) {
            await enrollPlannedOffer(plannedOffer);
            addedCount++;
            state.enrollmentProgress.completed = addedCount;
            renderControls();
        }
        setStatus(`Enrollment complete. ${addedCount} offers added.`);
    }, error => {
        setStatus(`${error.message} ${addedCount} offers added.`);
    });
}
