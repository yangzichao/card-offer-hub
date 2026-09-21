const { saveWorkspace, requireWorkspaceSaved, restoreWorkspace, recordWorkspaceScan,
    markWorkspaceOfferPending, finishWorkspaceOffer, bindWorkspaceScope } = createHubWorkspaceStore({
    state, fields: WORKSPACE_FIELDS, storage: issuerStorage, storageKey: `${SETTINGS.id}:workspace`,
    onError: () => renderPanel(),
    readConsent: () => state.accountConsent, writeConsent: value => { state.accountConsent = value; }
});
function workspaceCacheNotice() { return hubWorkspaceCacheNotice(state); }
function restoreWorkspacePanel(panel, bankName) { hubRestoreWorkspacePanel(panel, bankName, state); }
