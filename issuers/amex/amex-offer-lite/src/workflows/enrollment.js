// Adds every planned offer in one unattended run: one request at a time, the
// minimum gap between them, no retries, and a stop that takes effect immediately.
// An explicit per-offer answer (declined, already on another card) never ends the
// run; transport failures, 429, Stop and storage errors still do.
const CONSECUTIVE_UNCONFIRMED_PAUSE = 3;

async function startEnrollment(groupKey = null) {
    if (!SETTINGS.capabilities.activation || state.busy || Date.now() < state.cooldownUntil) return;
    const plan = enrollmentPlan(groupKey, { forExecution: true });
    if (!plan.length) return;
    state.enrollmentProgress = { total: plan.length, completed: 0 };
    const tally = createEnrollmentTally();
    let consecutiveUnconfirmed = 0;
    return runAmexAction('enroll', async () => {
        log(`Adding ${plan.length} offers one at a time via ${CARD_ENROLLMENT_ENDPOINT}, `
            + `${SETTINGS.requestGapMs / 1000}s apart, across ${new Set(plan.map(({ account }) => account.token)).size} cards.`);
        for (const plannedOffer of plan) {
            const status = await enrollPlannedOffer(plannedOffer);
            tally[status]++;
            state.enrollmentProgress.completed++;
            renderControls();
            // Unconfirmed answers are not explicit. Several in a row suggest the
            // response format changed, so pause before the whole queue turns unknown.
            consecutiveUnconfirmed = status === 'UNCONFIRMED' ? consecutiveUnconfirmed + 1 : 0;
            const remaining = plan.length - state.enrollmentProgress.completed;
            if (consecutiveUnconfirmed >= CONSECUTIVE_UNCONFIRMED_PAUSE && remaining > 0) {
                throw new Error(`Paused: Amex did not confirm ${CONSECUTIVE_UNCONFIRMED_PAUSE} offers in a row; `
                    + `${remaining} offers were not attempted. Scan to check the unconfirmed ones before adding again.`);
            }
        }
        setStatus(`Enrollment complete. ${enrollmentTallySummary(tally)}`);
    }, error => {
        setStatus(`${error.message} ${enrollmentTallySummary(tally)}`);
    });
}
