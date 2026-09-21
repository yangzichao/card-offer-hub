function createHubPacingDiagnostics({ state, storage, storageKey, version }) {
    const logKey = `${storageKey}:diagnostics`;
    const diagnostics = state.pacingDiagnostics = {
        issuer: storageKey.split(':')[0], version, events: [], storageError: ''
    };
    let restored = false;
    let preserveStoredData = false;
    function restore() {
        if (diagnostics.storageError) return; // Keep unsaved records for this page's download.
        try {
            const saved = storage.get(logKey, null);
            if (saved !== null && (saved.schemaVersion !== 1 || !Array.isArray(saved.events))) {
                preserveStoredData = true;
                throw new Error('Unsupported diagnostic log.');
            }
            diagnostics.events = saved === null ? [] : saved.events.slice(-HUB_PACING_LOG_LIMIT).map(hubSafePacingEvent).filter(Boolean);
            restored = true;
        } catch {
            preserveStoredData = true;
            diagnostics.storageError = 'Saved debug history is unavailable. This download includes the current page records.';
        }
    }
    function record(kind, fields = {}, persist = true) {
        if (!restored && !preserveStoredData) restore();
        const event = hubSafePacingEvent({ ...fields, kind, at: Date.now(), version: diagnostics.version });
        if (!event) return;
        diagnostics.events = [...diagnostics.events, event].slice(-HUB_PACING_LOG_LIMIT);
        if (!persist || preserveStoredData) return;
        try { storage.set(logKey, { schemaVersion: 1, events: diagnostics.events }); }
        catch { diagnostics.storageError = 'Debug history could not be saved. Download it before refreshing this page.'; }
    }
    return { restore, record };
}
