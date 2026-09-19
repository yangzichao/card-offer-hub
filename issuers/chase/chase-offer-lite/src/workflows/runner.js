async function runExclusive(action) {
    if (state.busy) return;
    state.busy = true;
    state.stopRequested = false;
    renderPanel();
    try {
        if (!navigator.locks?.request) throw new Error('This browser does not support the required tab lock. Use current Chrome.');
        await navigator.locks.request(SETTINGS.id, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error('A scan is running in another tab. Wait for it to finish.');
            restorePacing();
            if (state.storageError) throw new Error(state.storageError);
            ensureRunning();
            await action();
        });
    } catch (error) {
        state.needsScan = true;
        updateStatus(error.message);
    } finally {
        state.busy = false;
        renderPanel();
    }
}
