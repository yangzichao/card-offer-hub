function createHubPacingStorage({ state, storage, storageKey, onError = () => {}, policy: overrides,
    readLegacyCooldown = () => 0, version = 'unknown' }) {
    const policy = hubPacingPolicy(overrides);
    const diagnostics = createHubPacingDiagnostics({ state, storage, storageKey, version });
    const pacing = createHubAdaptivePacing({ state, policy, diagnostics });
    let revision = 0;
    function restorePacing() {
        diagnostics.restore();
        try {
            const saved = storage.get(storageKey, null);
            if (saved !== null) {
                const restored = hubReadPacingSnapshot(saved, policy, Date.now());
                revision = restored.revision;
                state.pacing = saved.schemaVersion === 1 ? { ...restored.profile,
                    currentGapMs: Math.max(state.pacing.currentGapMs, restored.profile.currentGapMs) } : restored.profile;
                state.cooldownUntil = Math.max(state.cooldownUntil, restored.cooldownUntil);
                state.nextRequestAt = Math.max(state.nextRequestAt, restored.nextRequestAt);
            } else {
                const legacyDeadline = readLegacyCooldown();
                if (!Number.isSafeInteger(legacyDeadline) || legacyDeadline < 0) throw new Error('Invalid legacy cooldown.');
                state.cooldownUntil = Math.max(state.cooldownUntil, legacyDeadline);
            }
            pacing.startRun();
        } catch {
            state.storageError = 'Cannot read pacing storage. Stored data was preserved; resolve storage before running.';
            diagnostics.record('pacing-read-failed', {}, false);
            onError(state.storageError);
        }
    }
    function savePacing() {
        if (state.storageError) return false;
        try {
            const current = storage.get(storageKey, null);
            const currentRevision = current === null ? 0 : hubReadPacingSnapshot(current, policy, Date.now()).revision;
            if (currentRevision !== revision) throw new Error('Pacing changed in another page.');
            storage.set(storageKey, {
                schemaVersion: 2, revision: revision + 1, ...state.pacing,
                cooldownUntil: state.cooldownUntil, nextRequestAt: state.nextRequestAt
            });
            revision++;
            return true;
        } catch {
            state.storageError = 'Cannot save pacing storage. Further requests are blocked; reload after fixing storage.';
            diagnostics.record('pacing-save-failed');
            onError(state.storageError);
            return false;
        }
    }
    return { restorePacing, savePacing, pacing };
}
