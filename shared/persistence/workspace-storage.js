const pendingWorkspaceOffers = new Set();
function saveWorkspace() {
    if (state.storageError) return false;
    try {
        const offers = state.offers.map(offer => {
            const record = serializeWorkspaceRecord(offer, WORKSPACE_FIELDS.offers);
            if (pendingWorkspaceOffers.has(workspaceOfferKey(offer))) {
                if ('status' in record) record.status = 'UNCONFIRMED';
                else { record.result = 'Unconfirmed'; record.eligible = false; }
            }
            return record;
        });
        const snapshot = validateWorkspaceSnapshot({
            schemaVersion: 1, savedAt: Date.now(), lastScanAt: state.lastScanAt,
            scopeIdentity: state.workspaceScope, accounts: (state.accounts || []).map(account => serializeWorkspaceRecord(account, WORKSPACE_FIELDS.accounts)),
            offers, selected: [...(state.selected || [])], consent: state.consent ?? state.accountConsent ?? false,
            search: state.search || '', collapsed: state.collapsed
        });
        GM_setValue(`${SETTINGS.id}:workspace`, snapshot);
        return true;
    } catch {
        state.storageError = 'Cannot save scan results and selections. Further requests are blocked; fix Tampermonkey storage and reload.';
        renderPanel();
        return false;
    }
}
function requireWorkspaceSaved() {
    if (!saveWorkspace()) throw new Error(state.storageError);
}
function restoreWorkspace() {
    try {
        const saved = GM_getValue(`${SETTINGS.id}:workspace`, null);
        if (saved === null) return; // Older releases only saved pacing; keep it intact.
        const snapshot = validateWorkspaceSnapshot(saved);
        if (WORKSPACE_FIELDS.accounts) state.accounts = snapshot.accounts;
        state.offers = snapshot.offers;
        if (state.selected) state.selected = new Set(snapshot.selected);
        if ('consent' in state) state.consent = snapshot.consent;
        if ('accountConsent' in state) state.accountConsent = snapshot.consent;
        state.search = snapshot.search;
        state.collapsed = snapshot.collapsed;
        state.lastScanAt = snapshot.lastScanAt;
        state.workspaceScope = snapshot.scopeIdentity;
        state.restoredWorkspace = true;
        state.needsScan = true;
        state.status = 'Saved results and selections restored. Scan manually to verify the current account before adding.';
    } catch {
        state.storageError = 'Cannot read saved results and selections. Stored data was preserved; resolve Tampermonkey storage before running.';
    }
}
function recordWorkspaceScan() {
    state.lastScanAt = Date.now();
    state.restoredWorkspace = false;
    pendingWorkspaceOffers.clear();
    requireWorkspaceSaved();
}
function markWorkspaceOfferPending(offer) {
    pendingWorkspaceOffers.add(workspaceOfferKey(offer));
    requireWorkspaceSaved(); // Must succeed before a write request can leave.
}
function finishWorkspaceOffer(offer) {
    pendingWorkspaceOffers.delete(workspaceOfferKey(offer));
    requireWorkspaceSaved();
}
