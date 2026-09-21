function createHubPacingStorage({ state, storage, storageKey, onError = () => {} }) {
    function restorePacing() {
        try {
            const saved = storage.get(storageKey, null);
            if (saved === null) return;
            if (saved.schemaVersion !== 1 || !Number.isFinite(saved.cooldownUntil)
                || !Number.isFinite(saved.nextRequestAt)) throw new Error('Unsupported pacing snapshot');
            state.cooldownUntil = Math.max(state.cooldownUntil, saved.cooldownUntil);
            state.nextRequestAt = Math.max(state.nextRequestAt, saved.nextRequestAt);
        } catch {
            state.storageError = 'Cannot read pacing storage. Stored data was preserved; resolve storage before running.';
        }
    }
    function savePacing() {
        if (state.storageError) return false;
        try {
            storage.set(storageKey, {
                schemaVersion: 1, cooldownUntil: state.cooldownUntil, nextRequestAt: state.nextRequestAt
            });
            return true;
        } catch {
            state.storageError = 'Cannot save pacing storage. Further requests are blocked; reload after fixing storage.';
            onError(state.storageError);
            return false;
        }
    }
    return { restorePacing, savePacing };
}
