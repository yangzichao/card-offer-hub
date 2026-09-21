const runExclusive = createHubActionRunner({
    state, settings: SETTINGS, ensureRunning: ensurePageReady, restorePacing, saveWorkspace,
    render: () => renderPanel(), updateStatus, supportsActivation: SETTINGS.capabilities.activation
});
