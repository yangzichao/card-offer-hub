async function runExclusive(action) {
    if (state.busy) return;
    state.busy = true;
    state.stopRequested = false;
    renderPanel();
    try {
        if (!navigator.locks?.request) throw new Error('A browser with Web Locks is required. Use current Chrome.');
        await navigator.locks.request(SETTINGS.id, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error('This script is running in another tab.');
            restorePacing();
            if (state.storageError) throw new Error(state.storageError);
            await action();
        });
    } catch (error) {
        state.needsScan = true;
        state.consent = false;
        updateStatus(error.message);
    } finally { state.busy = false; renderPanel(); }
}
