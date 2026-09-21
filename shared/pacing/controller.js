function createHubAdaptivePacing({ state, policy, diagnostics }) {
    state.pacing = hubNewPacingProfile(policy);
    let previousCompletion = null;
    function startRun() { previousCompletion = null; }
    function requestStarted() {
        const now = Date.now();
        diagnostics.record('request-start', { startedAt: now, previousCompletedAt: previousCompletion,
            gapBeforeMs: state.pacing.currentGapMs });
        return { startedAt: now, gapBeforeMs: state.pacing.currentGapMs, gapCreditMs: previousCompletion === null ? 0
            : Math.min(state.pacing.currentGapMs, Math.max(0, now - previousCompletion)) };
    }
    function requestFinished(ticket, outcome, httpStatus) {
        const now = Date.now();
        previousCompletion = now;
        const duration = Math.min(policy.maximumSampleDurationMs, Math.max(0, now - ticket.startedAt));
        // A 429 is already learned and persisted at the response headers.
        if (outcome !== 'limited') state.pacing = hubLearnPacing(state.pacing, { outcome, now, activeMs: duration + ticket.gapCreditMs }, policy);
        diagnostics.record('request-end', { startedAt: ticket.startedAt, durationMs: Math.max(0, now - ticket.startedAt),
            gapBeforeMs: ticket.gapBeforeMs, gapAfterMs: state.pacing.currentGapMs, outcome, httpStatus,
            successCount: state.pacing.successCount, observedActiveMs: state.pacing.observedActiveMs, cooldownUntil: state.cooldownUntil });
    }
    function rateLimited(retryAfter) {
        const now = Date.now();
        const gapBeforeMs = state.pacing.currentGapMs;
        state.pacing = hubLearnPacing(state.pacing, { outcome: 'limited', now }, policy);
        const clientDelay = Math.min(policy.maximumClientCooldownMs,
            policy.defaultCooldownMs * 2 ** (state.pacing.consecutiveLimits - 1));
        const serverDelay = hubRetryAfterMilliseconds(retryAfter, policy.defaultCooldownMs, now);
        const serverDeadline = Math.min(Number.MAX_SAFE_INTEGER, now + Math.ceil(serverDelay));
        state.cooldownUntil = Math.max(state.cooldownUntil, now + clientDelay, serverDeadline);
        diagnostics.record('rate-limited', { gapBeforeMs, gapAfterMs: state.pacing.currentGapMs,
            cooldownUntil: state.cooldownUntil, serverWaitMs: serverDeadline - now, httpStatus: 429 });
    }
    return { policy, startRun, requestStarted, requestFinished, rateLimited,
        getGap: () => state.pacing.currentGapMs };
}
