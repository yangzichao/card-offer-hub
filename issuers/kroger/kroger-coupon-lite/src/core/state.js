const SETTINGS = {
    capabilities: __USERSCRIPT_CAPABILITIES__, workflow: __USERSCRIPT_WORKFLOW__,
    id: __USERSCRIPT_ID__, name: __USERSCRIPT_NAME__, version: __USERSCRIPT_VERSION__,
    origin: 'https://www.kroger.com',
    gapMilliseconds: 500, timeoutMilliseconds: 30000,
    defaultCooldownMilliseconds: 300000,
    // Kroger's own Coupons page reads 72 per page. The page cap only guards
    // against a list that never reports its end.
    couponPageSize: 72, maximumCouponPages: 40,
    // Pause instead of burning through the whole list when Kroger stops confirming.
    maximumConsecutiveUnconfirmedClips: 3
};
const state = {
    lastScanAt: 0, workspaceScope: '', restoredWorkspace: false,
    offers: [], selected: new Set(), activeAction: null, busy: false, stopRequested: false,
    needsScan: true, nextRequestAt: 0, cooldownUntil: 0, storageError: '',
    status: 'Open Kroger Coupons, then click Clip all coupons. Nothing runs automatically.',
    processed: 0, confirmed: 0, total: 0, panel: null, collapsed: false, search: ''
};
function updateStatus(message) {
    state.status = message;
    renderPanel();
}
function ensureRunning() {
    if (state.stopRequested) throw new Error('Stopped. Click Clip all coupons again to continue with the coupons that are left.');
    if (location.origin !== SETTINGS.origin) throw new Error('Open Kroger Coupons on www.kroger.com and try again.');
}
function stopRun() {
    state.stopRequested = true;
    updateStatus('Stopping after the current request settles.');
}
