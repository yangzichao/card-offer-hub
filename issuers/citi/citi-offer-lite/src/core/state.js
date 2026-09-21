const SETTINGS = {
    capabilities: __USERSCRIPT_CAPABILITIES__, workflow: __USERSCRIPT_WORKFLOW__,
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    apiBase: '/gcgapi/prod/public/v1',
    retrievePath: '/digital/customers/creditCards/merchantOffers/retrieve',
    enrollmentPath: '/digital/customers/creditCards/accounts/rewards/specialOffers/enrollMerchantOffer',
    gapMilliseconds: 500, timeoutMilliseconds: 45000,
    defaultCooldownMilliseconds: 300000
};
const state = {
    lastScanAt: 0, workspaceScope: '', restoredWorkspace: false,
    accounts: [], selected: new Set(), offers: [], activeAction: null, busy: false, stopRequested: false,
    needsScan: false, continuationBlocked: false, nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Refresh all cards & offers to get started. Nothing runs automatically.',
    confirmed: 0, completed: 0, total: 0, panel: null, collapsed: false, search: ''
};
function updateStatus(message) {
    state.status = message;
    renderPanel();
}
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Scan again before adding more offers.');
    if (location.origin !== 'https://online.citi.com' || !/^\/US\/(?:ag|nga)\//.test(location.pathname)) {
        throw new Error('Open a signed-in Citi page and scan again.');
    }
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request settles. Its result may still be confirmed.');
}
