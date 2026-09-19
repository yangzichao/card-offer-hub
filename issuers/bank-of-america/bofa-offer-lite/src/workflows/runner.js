async function runExclusive(action) {
    if (state.busy) return;
    let workspaceActionStarted = false;
    state.busy = true;
    state.stopRequested = false;
    renderPanel();
    try {
        if (!navigator.locks?.request) throw new Error('A browser with Web Locks is required. Use current Chrome.');
        await navigator.locks.request(SETTINGS.id, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error('This script is running in another tab.');
            restorePacing();
            if (state.storageError) throw new Error(state.storageError);
            workspaceActionStarted = true;
            await action();
        });
    } catch (error) {
        state.needsScan = true;
        updateStatus(error.message);
    } finally {
        state.busy = false;
        if (workspaceActionStarted) saveWorkspace();
        renderPanel();
    }
}
