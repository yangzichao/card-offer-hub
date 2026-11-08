function requestKrogerCouponPage(offset, accountKey) {
    return sendRequest(() => {
        ensureSameKrogerAccount(accountKey);
        return { url: krogerCouponPageUrl(offset), options: {
            method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            headers: { ...krogerContextHeaders(), 'user-time-zone': Intl.DateTimeFormat().resolvedOptions().timeZone }
        }, validateResponse(payload) {
            ensureSameKrogerAccount(accountKey);
            normalizeKrogerCouponPage(payload);
            return true;
        } };
    });
}
function requestKrogerClip(coupon, accountKey) {
    return sendRequest(() => {
        ensureSameKrogerAccount(accountKey);
        return { url: KROGER_CLIP_PATH, options: {
            method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            headers: { ...krogerContextHeaders(), 'Content-Type': 'application/json' },
            body: krogerClipBody(coupon)
        }, validateResponse: payload => krogerClipConfirmed(payload, coupon) };
    });
}
