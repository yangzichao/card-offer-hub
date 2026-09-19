async function workspaceScopeFingerprint(value) {
    // A one-way scope marker can detect a changed opaque session without storing
    // the credential itself. It cannot be used to authenticate any request.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function bindWorkspaceScope(scope) {
    if (state.workspaceScope && state.workspaceScope !== scope) {
        if (state.selected) state.selected.clear();
        if ('consent' in state) state.consent = false;
        if ('accountConsent' in state) state.accountConsent = false;
        state.offers = [];
        state.lastScanAt = 0;
        pendingWorkspaceOffers.clear();
    }
    state.workspaceScope = scope;
}
