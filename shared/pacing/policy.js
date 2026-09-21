// Client heuristics, not issuer-published limits. Each bank owns an independent profile.
const HUB_PACING_POLICY = Object.freeze({
    version: 1, initialGapMs: 1000, minimumGapMs: 500, maximumGapMs: 15000,
    accelerationStepMs: 50, stableSamples: 30, stableActiveMs: 60000,
    recoveryHoldMs: 600000, staleAfterMs: 7 * 86400000,
    defaultCooldownMs: 300000, maximumClientCooldownMs: 3600000,
    maximumSampleDurationMs: 45000
});
function hubPacingPolicy(overrides = {}) {
    const policy = { ...HUB_PACING_POLICY, ...overrides };
    for (const value of Object.values(policy)) {
        if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid pacing policy.');
    }
    if (policy.version !== HUB_PACING_POLICY.version || policy.minimumGapMs > policy.initialGapMs
        || policy.initialGapMs > policy.maximumGapMs || policy.defaultCooldownMs > policy.maximumClientCooldownMs) {
        throw new Error('Inconsistent pacing policy.');
    }
    return Object.freeze(policy);
}
function hubNewPacingProfile(policy) {
    return { policyVersion: policy.version, currentGapMs: policy.initialGapMs, lastStableGapMs: null,
        successCount: 0, observedActiveMs: 0, lastRateLimitAt: 0, consecutiveLimits: 0, updatedAt: 0 };
}
