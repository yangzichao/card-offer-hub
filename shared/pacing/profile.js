function hubReadPacingSnapshot(saved, policy, now) {
    if (!saved || ![1, 2].includes(saved.schemaVersion)) throw new Error('Unsupported pacing snapshot.');
    for (const field of ['nextRequestAt', 'cooldownUntil']) {
        if (!Number.isSafeInteger(saved[field]) || saved[field] < 0) throw new Error('Invalid pacing deadline.');
    }
    let profile = hubNewPacingProfile(policy);
    let revision = 0;
    if (saved.schemaVersion === 2) {
        if (saved.policyVersion !== policy.version) throw new Error('Unsupported pacing policy version.');
        for (const field of ['revision', 'currentGapMs', 'successCount', 'observedActiveMs', 'lastRateLimitAt', 'consecutiveLimits', 'updatedAt']) {
            if (!Number.isSafeInteger(saved[field]) || saved[field] < 0) throw new Error('Invalid pacing profile.');
        }
        const validGap = gap => Number.isSafeInteger(gap) && gap >= policy.minimumGapMs && gap <= policy.maximumGapMs;
        if (!validGap(saved.currentGapMs) || (saved.lastStableGapMs !== null && !validGap(saved.lastStableGapMs))) {
            throw new Error('Invalid learned request interval.');
        }
        profile = Object.fromEntries(Object.keys(profile).map(key => [key, saved[key]]));
        revision = saved.revision;
        if (now - profile.updatedAt > policy.staleAfterMs) {
            profile = { ...profile, currentGapMs: Math.max(profile.currentGapMs, policy.initialGapMs),
                lastStableGapMs: null, successCount: 0, observedActiveMs: 0 };
        }
    }
    return { profile, revision, nextRequestAt: saved.nextRequestAt, cooldownUntil: saved.cooldownUntil };
}
