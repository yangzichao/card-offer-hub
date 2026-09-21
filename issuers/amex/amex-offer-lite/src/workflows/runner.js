function runAmexAction(actionKind, execute, fail) {
    return runHubActionLifecycle({
        isBusy: () => Boolean(state.busy),
        begin() { state.busy = actionKind; state.cancelRequested = false; render(); },
        execute, fail,
        finish() { state.busy = null; state.cancelRequested = false; render(); }
    });
}
