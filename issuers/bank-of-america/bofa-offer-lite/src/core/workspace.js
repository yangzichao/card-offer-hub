const { saveWorkspace, requireWorkspaceSaved, restoreWorkspace, recordWorkspaceScan,
    markWorkspaceOfferPending, finishWorkspaceOffer, bindWorkspaceScope } = createHubWorkspaceStore({
    state, workflowType: SETTINGS.workflow, fields: WORKSPACE_FIELDS, storage: issuerStorage, storageKey: `${SETTINGS.id}:workspace`,
    onError: () => renderPanel(),
    readConsent: () => state.consent, writeConsent: value => { state.consent = value; },
    markPendingRecord: record => { record.result = 'Unconfirmed'; record.eligible = false; }
});
function workspaceCacheNotice() { return hubWorkspaceCacheNotice(state); }
function restoreWorkspacePanel(panel, bankName) { hubRestoreWorkspacePanel(panel, bankName, state); }
