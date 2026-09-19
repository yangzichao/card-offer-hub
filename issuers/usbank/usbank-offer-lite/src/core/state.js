const SETTINGS = {
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    endpoint: '/digital/api/customer-management/graphql/v2',
    gapMilliseconds: 500, timeoutMilliseconds: 45000,
    defaultCooldownMilliseconds: 300000
};
const state = {
    offers: [], selected: new Set(), session: null, busy: false, stopRequested: false,
    needsScan: true, nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Open Cash Back Deals, then scan. Nothing runs automatically.',
    confirmed: 0, total: 0, panel: null, collapsed: false, search: ''
};
function updateStatus(message) {
    state.status = message;
    renderPanel();
}
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Scan again before activating more offers.');
    if (location.origin !== 'https://onlinebanking.usbank.com'
        || !/^\/(?:digital\/servicing\/)?dominjection\/cashback-deals\/?$/.test(location.pathname)) {
        throw new Error('Open the signed-in Cash Back Deals page and scan again.');
    }
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request settles. Unverified activations remain unconfirmed.');
}
