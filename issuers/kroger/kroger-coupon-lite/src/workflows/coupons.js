async function bindKrogerAccount() {
    const accountKey = readKrogerAccountKey();
    bindWorkspaceScope(await workspaceScopeFingerprint(accountKey));
    return accountKey;
}
function krogerCouponCount(status) {
    return state.offers.filter(offer => offer.status === status).length;
}
// Reads every unclipped coupon page in order. Offsets advance by the number of
// records Kroger returned, and the read ends only when Kroger reports no more.
async function readAllKrogerCoupons(accountKey) {
    const couponsById = new Map();
    let offset = 0;
    for (let page = 0; page < SETTINGS.maximumCouponPages; page++) {
        updateStatus(page ? `Loading Kroger coupons… ${couponsById.size} so far` : 'Loading Kroger coupons…');
        const listing = normalizeKrogerCouponPage(await requestKrogerCouponPage(offset, accountKey));
        ensureRunning();
        mergeKrogerCoupons(couponsById, listing.coupons);
        offset += listing.coupons.length;
        if (!listing.hasMore) return [...couponsById.values()];
        if (!listing.coupons.length) throw new Error('Kroger coupon list ended early. Reload Coupons and try again.');
    }
    throw new Error('Kroger returned more coupon pages than expected. Reload Coupons and try again.');
}
async function refreshKrogerCoupons(accountKey) {
    state.needsScan = true;
    state.offers = await readAllKrogerCoupons(accountKey);
    state.needsScan = false;
    recordWorkspaceScan();
}
function loadKrogerCoupons() {
    return runExclusive(async () => {
        state.processed = 0;
        state.confirmed = 0;
        state.total = 0;
        await refreshKrogerCoupons(await bindKrogerAccount());
        updateStatus(`Loaded ${state.offers.length} coupons: ${krogerCouponCount('AVAILABLE')} ready to clip. Click Clip all coupons to clip them.`);
    });
}
