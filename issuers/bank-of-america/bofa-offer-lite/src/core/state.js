const SETTINGS = {
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    gapMilliseconds: 500, timeoutMilliseconds: 45000, pageSize: 24,
    defaultCooldownMilliseconds: 300000
};
const state = {
    lastScanAt: 0, workspaceScope: '', restoredWorkspace: false,
    busy: false, stopRequested: false, needsScan: true, consent: false,
    sessionToken: '', proximity: null, offers: [], confirmed: 0,
    nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Nothing runs automatically. Scan the current signed-in Deals profile first.',
    panel: null, collapsed: false
};
function updateStatus(message) { state.status = message; renderPanel(); }
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Scan again before activating more offers.');
    if (location.origin !== 'https://deals.merchant-rewards.com') throw new Error('Open the official Deals website.');
    if (!state.sessionToken || currentSessionToken() !== state.sessionToken) {
        throw new Error('The signed-in session changed. Scan again.');
    }
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request. Any unverified activation requires a new scan.');
}
