const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/userscript-harness.cjs');
const { coupon, couponPage, clipResponse, contextHeaders } = require('./fixtures/coupons.cjs');

test('Kroger coupon list URL mirrors the page filter for coupons that can still be clipped', () => {
    const h = createHarness(() => { throw new Error('no request expected'); });
    const url = new URL(h.krogerCouponPageUrl(144), 'https://www.kroger.com');
    assert.equal(url.pathname, '/atlas/v1/savings-coupons/v2/coupons');
    assert.deepEqual(url.searchParams.getAll('filter.status'), ['unclipped', 'active']);
    assert.equal(url.searchParams.get('page.size'), '72');
    assert.equal(url.searchParams.get('page.offset'), '144');
    assert.equal(url.searchParams.get('filter.onlyNewCoupons'), 'false');
});

test('only explicit Kroger flags make a coupon clippable or clipped', () => {
    const h = createHarness(() => { throw new Error('no request expected'); });
    const status = raw => h.normalizeKrogerCoupon(raw).status;
    assert.equal(status(coupon('1000001')), 'AVAILABLE');
    assert.equal(status(coupon('1000002', { addedToCard: true })), 'ACTIVATED');
    assert.equal(status(coupon('1000003', { canBeAddedToCard: false })), 'UNAVAILABLE');
    assert.equal(status(coupon('1000004', { addedToCard: undefined })), 'UNAVAILABLE');
    assert.equal(status(coupon('1000005', { krogerCouponNumber: undefined })), 'UNAVAILABLE', 'no confirmation key, no clip');
    const normalized = h.normalizeKrogerCoupon(coupon('1000006', { brand: '', categories: ['Pantry', { name: 'ignored' }] }));
    assert.equal(normalized.merchant, 'Kroger');
    assert.equal(normalized.category, 'Pantry');
    assert.equal(h.normalizeKrogerCoupon({ ...coupon('1'), id: 1000007 }).offerId, '1000007');
    for (const id of [undefined, '', 'abc', '0000', -1]) assert.throws(() => h.normalizeKrogerCoupon(coupon(id)), /incomplete coupon/);
});

test('unrecognized list pages fail closed and duplicate disagreements become conflicts', () => {
    const h = createHarness(() => { throw new Error('no request expected'); });
    for (const payload of [{}, { data: { coupons: [] } }, { data: { coupons: {} }, meta: { coupons: { page: { hasMore: false } } } },
        { data: { coupons: [] }, meta: { coupons: { page: { hasMore: 'false' } } } }]) {
        assert.throws(() => h.normalizeKrogerCouponPage(payload), /not recognized/);
    }
    assert.equal(h.normalizeKrogerCouponPage(couponPage([coupon('1000001')], true)).hasMore, true);
    const merged = h.mergeKrogerCoupons(new Map(), [h.normalizeKrogerCoupon(coupon('1000001'))]);
    h.mergeKrogerCoupons(merged, [h.normalizeKrogerCoupon(coupon('1000001'))]);
    assert.equal(merged.get('1000001').status, 'AVAILABLE', 'identical copies merge');
    h.mergeKrogerCoupons(merged, [h.normalizeKrogerCoupon(coupon('1000001', { addedToCard: true }))]);
    assert.equal(merged.get('1000001').status, 'CONFLICT');
});

test('a clip counts only when Kroger names the same coupon number', () => {
    const h = createHarness(() => { throw new Error('no request expected'); });
    const target = h.normalizeKrogerCoupon(coupon('1000001'));
    assert.equal(h.krogerClipConfirmed(clipResponse(['900001000001']), target), true);
    assert.equal(h.krogerClipConfirmed(clipResponse(['900001000002']), target), false);
    assert.equal(h.krogerClipConfirmed(clipResponse([]), target), false);
    assert.equal(h.krogerClipConfirmed({ data: {} }, target), false);
    assert.equal(h.krogerClipConfirmed(null, target), false);
    assert.equal(h.krogerClipConfirmed(clipResponse(['']), { ...target, couponNumber: '' }), false);
});

test('context headers come only from the page’s own same-origin WEB savings requests', () => {
    const h = createHarness(() => { throw new Error('no request expected'); }, { captureContext: false });
    assert.throws(() => h.krogerContextHeaders(), /finish loading/);
    assert.equal(h.captureKrogerContext('https://evil.example/atlas/v1/x', contextHeaders), false);
    assert.equal(h.captureKrogerContext('https://www.kroger.com/api/other', contextHeaders), false);
    assert.equal(h.captureKrogerContext('/atlas/v1/x', { ...contextHeaders, 'x-kroger-channel': 'APP' }), false);
    assert.equal(h.captureKrogerContext('/atlas/v1/x', { ...contextHeaders, 'x-laf-object': '' }), false);
    assert.equal(h.captureKrogerContext('/atlas/v1/x', { ...contextHeaders, 'x-modality': 'a\r\nb' }), false);
    assert.throws(() => h.krogerContextHeaders(), /finish loading/);
    assert.equal(h.captureKrogerContext('/atlas/v1/monetization/v2/ad-placements',
        new Map(Object.entries({ ...contextHeaders, authorization: 'synthetic-secret', cookie: 'synthetic-cookie' }))), true);
    const headers = h.krogerContextHeaders();
    assert.equal(headers['x-kroger-channel'], 'WEB');
    assert.equal(headers['x-call-origin'], '{"page":"coupon","component":"coupons"}');
    assert.equal('authorization' in headers || 'cookie' in headers, false, 'only allowlisted headers are copied');
});
