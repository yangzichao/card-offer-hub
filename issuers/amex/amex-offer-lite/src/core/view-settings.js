const SAVED_VIEW_SETTINGS_KEY = `${__USERSCRIPT_ID__}:view`;
let viewSettingsReadFailed = false;
function restoreViewSettings() {
    try {
        const saved = GM_getValue(SAVED_VIEW_SETTINGS_KEY, null);
        if (saved === null) return;
        if (saved.schemaVersion !== 1 || typeof saved.filter !== 'string' || typeof saved.minimized !== 'boolean') {
            throw new Error('Unsupported saved view');
        }
        state.filter = saved.filter;
        state.minimized = saved.minimized;
    } catch {
        viewSettingsReadFailed = true;
        log('Could not restore display settings. Stored data was preserved.');
    }
}
function persistViewSettings() {
    if (viewSettingsReadFailed) return;
    try {
        GM_setValue(SAVED_VIEW_SETTINGS_KEY, { schemaVersion: 1, filter: state.filter, minimized: state.minimized });
    } catch { log('Could not save search and panel settings. Check Tampermonkey storage.'); }
}
