function runAmexAction(actionKind, execute, fail) {
    return runHubActionLifecycle({
        isBusy: () => Boolean(state.busy),
        begin() { state.busy = actionKind; state.cancelRequested = false; render(); },
        async execute() {
            if (!navigator.locks?.request) throw new Error('This browser does not support the required tab lock. Use current Chrome.');
            return navigator.locks.request(__USERSCRIPT_ID__, { ifAvailable: true }, async lock => {
                if (!lock) throw new Error('Amex is running in another tab. Wait for it to finish.');
                restorePacing();
                requireActiveRequest();
                return execute();
            });
        }, fail,
        finish() { state.busy = null; state.cancelRequested = false; render(); }
    });
}
