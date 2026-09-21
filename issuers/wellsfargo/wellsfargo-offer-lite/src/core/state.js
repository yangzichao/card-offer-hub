const SETTINGS = {
    capabilities: __USERSCRIPT_CAPABILITIES__,
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    retrievePath: '/deals-portal/as/getDeals', enrollmentPath: '/deals-portal/as/activateCLDeal',
    gapMilliseconds: 500, timeoutMilliseconds: 45000, defaultCooldownMilliseconds: 300000
};
const state = {
    lastScanAt: 0, workspaceScope: '', restoredWorkspace: false,
    offers: [], accountConsent: false, activeAction: null, busy: false, stopRequested: false, needsScan: true,
    nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Open My Wells Fargo Deals and click Scan offers. Nothing runs automatically.',
    confirmed: 0, completed: 0, total: 0, panel: null, collapsed: false, search: ''
};
function updateStatus(message) {
    state.status = message;
    renderPanel();
}
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Scan again before adding more offers.');
    if (location.origin !== 'https://web.secure.wellsfargo.com'
        || !/^\/(?:auth\/deals-portal(?:\/|$)|deals-portal\/)/.test(location.pathname)) {
        throw new Error('Open the signed-in My Wells Fargo Deals page and scan again.');
    }
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request settles. Its result may still be confirmed.');
}
