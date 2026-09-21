const SETTINGS = {
    capabilities: __USERSCRIPT_CAPABILITIES__, workflow: __USERSCRIPT_WORKFLOW__,
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    gapMilliseconds: 500, timeoutMilliseconds: 45000,
    defaultCooldownMilliseconds: 300000
};
const state = {
    lastScanAt: 0, workspaceScope: '', restoredWorkspace: false,
    accounts: [], selected: new Set(), offers: [], busy: false, stopRequested: false,
    needsScan: true, nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Load your cards and offers to get started. Nothing runs until you click.',
    confirmed: 0, completed: 0, total: 0, panel: null, collapsed: false, search: '',
    enrollmentSupported: SETTINGS.capabilities.activation, sessionIdentity: ''
};
function updateStatus(message) {
    state.status = message;
    renderPanel();
}
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Your progress is saved. Use Add saved offers to continue.');
    if (location.origin !== 'https://secure.chase.com') {
        throw new Error('Open the signed-in Chase Offers page and scan again.');
    }
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request settles.');
}
