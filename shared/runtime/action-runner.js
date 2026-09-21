// This owns task lifecycle only; the action owns its immutable scope and bank protocol.
function createHubActionRunner({ state, settings, ensureRunning, restorePacing, saveWorkspace,
    render, updateStatus, onFailure = () => {}, supportsActivation = false }) {
    return async function runExclusive(action, actionKind = 'scan') {
        if (actionKind === 'add' && !supportsActivation) return;
        let workspaceActionStarted = false;
        return runHubActionLifecycle({ isBusy: () => Boolean(state.busy),
            begin() {
                state.busy = true;
                state.activeAction = actionKind;
                if (actionKind === 'add') state.total = 0;
                state.stopRequested = false;
                render();
            },
            async execute() {
                if (!navigator.locks?.request) throw new Error('This browser does not support the required tab lock. Use current Chrome.');
                await navigator.locks.request(settings.id, { ifAvailable: true }, async lock => {
                    if (!lock) throw new Error(`${settings.name} is running in another tab. Wait for it to finish.`);
                    restorePacing();
                    if (state.storageError) throw new Error(state.storageError);
                    ensureRunning();
                    workspaceActionStarted = true;
                    await action();
                });
            },
            fail(error) {
                state.needsScan = true;
                onFailure(error);
                updateStatus(error.message);
            },
            finish() {
                state.busy = false;
                state.activeAction = null;
                if (workspaceActionStarted) saveWorkspace();
                render();
            }
        });
    };
}
