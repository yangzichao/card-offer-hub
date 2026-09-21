const runExclusive = createHubActionRunner({
    state, settings: SETTINGS, ensureRunning, restorePacing, saveWorkspace,
    render: () => renderPanel(), updateStatus, supportsActivation: SETTINGS.capabilities.activation,
    onFailure: () => { state.continuationBlocked = true; }
});

function setCardSelected(accountId, selected) {
    if (state.busy || !state.accounts.some(card => card.accountId === accountId)) return;
    if (selected) state.selected.add(accountId); else state.selected.delete(accountId);
    saveWorkspace();
    renderPanel();
}
