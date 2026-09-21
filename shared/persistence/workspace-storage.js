function createHubWorkspaceStore({ state, fields, storage, storageKey, workflowType, onError = () => {},
    readConsent = () => false, writeConsent = () => {},
    markPendingRecord = record => { record.status = 'UNCONFIRMED'; } }) {
    const pendingWorkspaceOffers = new Set();
    function saveWorkspace() {
        if (state.storageError) return false;
        try {
            const offers = state.offers.map(offer => {
                const record = serializeWorkspaceRecord(offer, fields.offers);
                if (pendingWorkspaceOffers.has(workspaceOfferKey(offer))) {
                    markPendingRecord(record);
                }
                return record;
            });
            const snapshot = validateWorkspaceSnapshot({
                schemaVersion: 2, workflowType, savedAt: Date.now(), lastScanAt: state.lastScanAt,
                scopeIdentity: state.workspaceScope, accounts: (state.accounts || []).map(account => serializeWorkspaceRecord(account, fields.accounts)),
                offers, selected: [...(state.selected || [])], consent: readConsent(),
                search: state.search || '', collapsed: state.collapsed
            }, fields, workflowType);
            storage.set(storageKey, snapshot);
            return true;
        } catch {
            state.storageError = 'Cannot save scan results and selections. Further requests are blocked; fix Tampermonkey storage and reload.';
            onError(state.storageError);
            return false;
        }
    }
    function requireWorkspaceSaved() {
        if (!saveWorkspace()) throw new Error(state.storageError);
    }
    function restoreWorkspace() {
        try {
            const saved = storage.get(storageKey, null);
            if (saved === null) return; // Older releases only saved pacing; keep it intact.
            const snapshot = validateWorkspaceSnapshot(saved, fields, workflowType);
            if (fields.accounts) state.accounts = snapshot.accounts;
            state.offers = snapshot.offers;
            if (state.selected) state.selected = new Set(snapshot.selected);
            writeConsent(snapshot.consent);
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

    function bindWorkspaceScope(scope) {
        if (state.workspaceScope && state.workspaceScope !== scope) {
            if (state.selected) state.selected.clear();
            writeConsent(false);
            state.offers = [];
            state.lastScanAt = 0;
            pendingWorkspaceOffers.clear();
        }
        state.workspaceScope = scope;
    }

    return { saveWorkspace, requireWorkspaceSaved, restoreWorkspace, recordWorkspaceScan, markWorkspaceOfferPending, finishWorkspaceOffer, bindWorkspaceScope };
}
