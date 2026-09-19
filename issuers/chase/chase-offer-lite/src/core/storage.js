// Store only pacing state. Account IDs, offers, cookies, and request headers stay
// in memory; a reload always requires fresh discovery and manual card selection.
function restorePacing() {
    try {
        const saved = GM_getValue(`${SETTINGS.id}:pacing`, null);
        if (saved === null) return;
        if (saved.schemaVersion !== 1 || !Number.isFinite(saved.cooldownUntil)
            || !Number.isFinite(saved.nextRequestAt)) {
            throw new Error('Unsupported pacing snapshot; stored data was preserved.');
        }
        state.cooldownUntil = Math.max(state.cooldownUntil, saved.cooldownUntil);
        state.nextRequestAt = Math.max(state.nextRequestAt, saved.nextRequestAt);
    } catch {
        state.storageError = 'Cannot read pacing storage. Resolve Tampermonkey storage before running.';
    }
}
function savePacing() {
    try {
        GM_setValue(`${SETTINGS.id}:pacing`, {
            schemaVersion: 1, cooldownUntil: state.cooldownUntil, nextRequestAt: state.nextRequestAt
        });
    } catch {
        state.storageError = 'Cannot save pacing storage. Further requests are blocked; reload after fixing storage.';
        renderPanel();
    }
}
