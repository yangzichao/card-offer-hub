// One click: reload every coupon, then clip each available one in order.
// Every coupon is sent at most once per click. A clip without an explicit
// confirmation is recorded as UNCONFIRMED and is never retried in this run.
function clipAllKrogerCoupons() {
    return runExclusive(async () => {
        state.processed = 0;
        state.confirmed = 0;
        state.total = 0;
        const accountKey = await bindKrogerAccount();
        await refreshKrogerCoupons(accountKey);
        const queue = offerWorkflow.plan().map(record => record.source);
        state.total = queue.length;
        let unconfirmed = 0;
        let consecutiveUnconfirmed = 0;
        for (const coupon of queue) {
            ensureRunning();
            offerWorkflow.assertAction(coupon);
            updateStatus(`Clipping ${state.processed + 1} of ${queue.length}: ${coupon.merchant}…`);
            markWorkspaceOfferPending(coupon);
            let payload;
            try {
                payload = await requestKrogerClip(coupon, accountKey);
            } catch (error) {
                coupon.status = 'UNCONFIRMED';
                throw error;
            }
            state.processed++;
            if (krogerClipConfirmed(payload, coupon)) {
                coupon.status = 'ACTIVATED';
                state.confirmed++;
                consecutiveUnconfirmed = 0;
            } else {
                coupon.status = 'UNCONFIRMED';
                unconfirmed++;
                consecutiveUnconfirmed++;
            }
            finishWorkspaceOffer(coupon);
            renderPanel();
            if (consecutiveUnconfirmed >= SETTINGS.maximumConsecutiveUnconfirmedClips && state.processed < queue.length) {
                throw new Error(`Paused: Kroger did not confirm ${consecutiveUnconfirmed} clips in a row. ${state.confirmed} clipped, ${queue.length - state.processed} not sent. Check Kroger Coupons, then click Clip all coupons again.`);
            }
        }
        ensureRunning();
        updateStatus(!queue.length ? 'No coupons left to clip. Everything available is already on your card.'
            : unconfirmed ? `Finished: ${state.confirmed} of ${queue.length} clipped. ${unconfirmed} not confirmed; Clip all coupons checks them again next time.`
            : `Finished: all ${state.confirmed} coupons clipped.`);
    }, 'add');
}
