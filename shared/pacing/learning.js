// Pure transition: no timers, requests, UI, storage, or issuer globals.
function hubLearnPacing(profile, event, policy) {
    const next = { ...profile, updatedAt: event.now };
    if (event.outcome === 'limited') {
        next.currentGapMs = Math.min(policy.maximumGapMs, profile.currentGapMs * 2);
        next.consecutiveLimits = Math.min(32, profile.consecutiveLimits + 1);
        next.lastRateLimitAt = event.now;
        next.successCount = 0;
        next.observedActiveMs = 0;
    } else if (event.outcome === 'success') {
        next.successCount = Math.min(policy.stableSamples, profile.successCount + 1);
        next.observedActiveMs = Math.min(policy.stableActiveMs, profile.observedActiveMs + event.activeMs);
        if (next.successCount >= policy.stableSamples && next.observedActiveMs >= policy.stableActiveMs) {
            next.lastStableGapMs = profile.currentGapMs;
            if (!profile.consecutiveLimits || event.now - profile.lastRateLimitAt >= policy.recoveryHoldMs) {
                next.currentGapMs = Math.max(policy.minimumGapMs, profile.currentGapMs - policy.accelerationStepMs);
                next.consecutiveLimits = 0;
            }
            next.successCount = 0;
            next.observedActiveMs = 0;
        }
    } else if (event.outcome === 'failure') {
        next.successCount = 0;
        next.observedActiveMs = 0;
    } else if (event.outcome !== 'neutral') {
        throw new Error('Unknown pacing observation.');
    }
    return next;
}
