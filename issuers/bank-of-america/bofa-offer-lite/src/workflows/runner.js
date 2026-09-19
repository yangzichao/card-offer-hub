async function runExclusive(action, actionKind = 'scan') {
    if (state.busy) return;
    let workspaceActionStarted = false;
    state.busy = true;
    state.activeAction = actionKind;
    if (actionKind === 'add') state.total = 0;
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
        state.activeAction = null;
        if (workspaceActionStarted) saveWorkspace();
        renderPanel();
    }
}
