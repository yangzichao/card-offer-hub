function createHubAdaptivePacing({ state, policy }) {
    state.pacing = hubNewPacingProfile(policy);
    let previousCompletion = null;
    function startRun() { previousCompletion = null; }
    function requestStarted() {
        const now = Date.now();
        return { startedAt: now, gapCreditMs: previousCompletion === null ? 0
            : Math.min(state.pacing.currentGapMs, Math.max(0, now - previousCompletion)) };
    }
    function requestFinished(ticket, outcome) {
        const now = Date.now();
        previousCompletion = now;
        if (outcome === 'limited') return; // Already learned and persisted at the response headers.
        const duration = Math.min(policy.maximumSampleDurationMs, Math.max(0, now - ticket.startedAt));
        state.pacing = hubLearnPacing(state.pacing, { outcome, now, activeMs: duration + ticket.gapCreditMs }, policy);
    }
    function rateLimited(retryAfter) {
        const now = Date.now();
        state.pacing = hubLearnPacing(state.pacing, { outcome: 'limited', now }, policy);
        const clientDelay = Math.min(policy.maximumClientCooldownMs,
            policy.defaultCooldownMs * 2 ** (state.pacing.consecutiveLimits - 1));
        const serverDelay = hubRetryAfterMilliseconds(retryAfter, policy.defaultCooldownMs, now);
        const serverDeadline = Math.min(Number.MAX_SAFE_INTEGER, now + Math.ceil(serverDelay));
        state.cooldownUntil = Math.max(state.cooldownUntil, now + clientDelay, serverDeadline);
    }
    return { policy, startRun, requestStarted, requestFinished, rateLimited,
        getGap: () => state.pacing.currentGapMs };
}
