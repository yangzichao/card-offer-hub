const { saveWorkspace, requireWorkspaceSaved, restoreWorkspace: restoreSavedWorkspace, recordWorkspaceScan,
    markWorkspaceOfferPending, finishWorkspaceOffer, bindWorkspaceScope } = createHubWorkspaceStore({
    state, workflowType: SETTINGS.workflow, fields: WORKSPACE_FIELDS, storage: issuerStorage, storageKey: `${SETTINGS.id}:workspace`,
    detailStorageKey: `${SETTINGS.id}:offer-details`,
    onError: () => renderPanel(),
    readConsent: () => state.consent, writeConsent: value => { state.consent = value; },
    markPendingRecord: record => { record.result = 'Unconfirmed'; record.eligible = false; }
});
// Saves from 1.8.1 and earlier also kept shopping links; drop them on restore.
function restoreWorkspace() {
    restoreSavedWorkspace();
    state.offers = state.offers.filter(isBofaOfferShown);
}
function workspaceCacheNotice() { return hubWorkspaceCacheNotice(state); }
function restoreWorkspacePanel(panel, bankName) { hubRestoreWorkspacePanel(panel, bankName, state); }
