async function runExclusive(action) {
    if (state.busy) return;
    let workspaceActionStarted = false;
    state.busy = true;
    state.stopRequested = false;
    renderPanel();
    const execute = async () => {
        restorePacing();
        if (state.storageError) throw new Error(state.storageError);
        ensureRunning();
        workspaceActionStarted = true;
        await action();
    };
    try {
        // Prevent two tabs running this script from enrolling simultaneously.
        if (!navigator.locks?.request) throw new Error('This browser does not support the required tab lock. Use current Chrome.');
        await navigator.locks.request(SETTINGS.id, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error(`${SETTINGS.name} is running in another tab. Wait for it to finish.`);
            await execute();
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
