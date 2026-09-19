// Only request deadlines are persisted, never credentials, offers or location.
function restorePacing() {
    try {
        const saved = GM_getValue(`${SETTINGS.id}:pacing`, null);
        if (saved === null) return;
        if (saved.schemaVersion !== 1 || !Number.isFinite(saved.nextRequestAt)
            || !Number.isFinite(saved.cooldownUntil)) throw new Error('Unsupported snapshot');
        state.nextRequestAt = Math.max(state.nextRequestAt, saved.nextRequestAt);
        state.cooldownUntil = Math.max(state.cooldownUntil, saved.cooldownUntil);
    } catch {
        state.storageError = 'Cannot read pacing storage. Stored data was preserved; fix storage before running.';
    }
}
function savePacing() {
    if (state.storageError) throw new Error(state.storageError);
    try {
        GM_setValue(`${SETTINGS.id}:pacing`, {
            schemaVersion: 1, nextRequestAt: state.nextRequestAt, cooldownUntil: state.cooldownUntil
        });
    } catch {
        state.storageError = 'Cannot save pacing storage. Further requests are blocked; fix storage and reload.';
        throw new Error(state.storageError);
    }
}
