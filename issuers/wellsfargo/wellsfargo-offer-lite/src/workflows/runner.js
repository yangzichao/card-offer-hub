const runExclusive = createHubActionRunner({
    state, settings: SETTINGS, ensureRunning, restorePacing, saveWorkspace,
    render: () => renderPanel(), updateStatus, supportsActivation: SETTINGS.capabilities.activation
});
