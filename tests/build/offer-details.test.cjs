const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { crossBankStorage, workspace, offer } = require('./fixtures/cross-bank-offers.cjs');
const { readPublishedSharedRuntime } = require('../helpers/published-issuer-source.cjs');
const kroger = require('../kroger/helpers/userscript-harness.cjs');
const { coupon, couponPage } = require('../kroger/fixtures/coupons.cjs');
const chase = require('../chase/helpers/userscript-harness.cjs');
const { listing: chaseListing, offer: chaseOffer } = require('../chase/fixtures/offers-response.cjs');
const usbank = require('../usbank/helpers/userscript-harness.cjs');
const wells = require('../wellsfargo/helpers/userscript-harness.cjs');
const bofa = require('../bank-of-america/helpers/userscript-harness.cjs');

function sharedRuntime() {
    const context = {};
    runInNewContext(`${readPublishedSharedRuntime()}
        globalThis.probe = { hubDecodeOfferDetails, hubEncodeOfferDetails, hubMergeOfferDetails, hubOfferDetailText };`, context);
    return context.probe;
}
function searchHarness(storage) {
    const source = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
    const boundary = source.indexOf('// --- Issuer dispatches ---');
    const context = { GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback), GM_setValue: () => {} };
    runInNewContext(source.slice(0, boundary) + 'globalThis.probe = { hubReadSavedResults, hubBuildOfferExport, hubOfferExportFileName };})();', context);
    return context.probe;
}

test('the detail store interns repeated text, round-trips, and refuses unknown versions', () => {
    const h = sharedRuntime();
    const terms = 'Shared terms. '.repeat(20);
    const encoded = h.hubEncodeOfferDetails(new Map([
        ['a', { details: 'Long A', terms }], ['b', { details: 'Long B', terms }], ['empty', { details: '', terms: '' }]
    ]), 1800000000000);
    assert.equal(encoded.schemaVersion, 1);
    assert.equal(encoded.texts.filter(text => text === terms).length, 1, 'identical terms are stored once');
    assert.equal('empty' in encoded.entries, false);
    const decoded = h.hubDecodeOfferDetails(JSON.parse(JSON.stringify(encoded)));
    assert.deepEqual({ ...decoded.get('b') }, { details: 'Long B', terms });
    assert.equal(h.hubDecodeOfferDetails(null).size, 0);
    for (const saved of [{ schemaVersion: 2, texts: [], entries: {} }, { schemaVersion: 1, texts: [], entries: { a: [0, -1] } },
        { schemaVersion: 1, texts: ['x'], entries: { a: [0] } }, { schemaVersion: 1, texts: [], entries: [] }]) {
        assert.throws(() => h.hubDecodeOfferDetails(saved), /offer details/);
    }
    assert.equal(h.hubOfferDetailText(`a\r\nb ${'x'.repeat(9000)}`).length, 8000);
    assert.equal(h.hubOfferDetailText(null), '');
});

test('fresh scans replace text, restored offers keep theirs, and removed offers drop out', () => {
    const h = sharedRuntime();
    const previous = new Map([['kept', { details: 'old kept', terms: '' }], ['refreshed', { details: 'old', terms: 'old terms' }],
        ['removed', { details: 'gone', terms: '' }]]);
    const merged = h.hubMergeOfferDetails(previous, [{ key: 'kept' }, { key: 'refreshed', details: 'new', terms: '' }, { key: 'new' }],
        offer => offer.key);
    assert.deepEqual([...merged.keys()], ['kept', 'refreshed']);
    assert.deepEqual({ ...merged.get('refreshed') }, { details: 'new', terms: '' });
});

test('bank normalizers read the full text observed in their list responses', () => {
    const chaseRaw = chaseOffer('synthetic-offer-a');
    chaseRaw.offerDisplayDetails = { ...chaseRaw.offerDisplayDetails, rewardDescriptionText: 'Chase long text', termsAndConditionsText: 'Chase terms' };
    const chaseOffers = chase.createHarness().normalizeOffers(chaseListing('101', [chaseRaw]), '101', '909');
    assert.deepEqual([chaseOffers[0].details, chaseOffers[0].terms], ['Chase long text', 'Chase terms']);

    const usbankAd = usbank.offer('a');
    usbankAd.ad.assets.copy.value = { ...usbankAd.ad.assets.copy.value, marketingCopy: 'US Bank long text', termsAndConditions: 'US Bank terms' };
    const usbankOffer = usbank.createHarness(() => {}).normalizeListing(usbank.listing([usbankAd])).offers[0];
    assert.deepEqual([usbankOffer.details, usbankOffer.terms], ['US Bank long text', 'US Bank terms']);

    const wellsOffer = wells.createHarness().normalizeOffers(wells.listing([wells.offer('1001', {}, { longDescription: 'Wells long text' })]))[0];
    assert.equal(wellsOffer.details, 'Wells long text');

    const bofaOffer = bofa.createHarness(() => {}).normalizeOffer(bofa.offer('101', { description: 'BofA long text', terms_and_conditions: 'BofA terms' }));
    assert.deepEqual([bofaOffer.details, bofaOffer.terms], ['BofA long text', 'BofA terms']);

    const krogerCoupon = kroger.createHarness(() => {}).normalizeKrogerCoupon(coupon('1000001', { longDescription: 'Kroger long text', requirementDescription: 'Buy 2' }));
    assert.deepEqual([krogerCoupon.details, krogerCoupon.terms], ['Kroger long text', 'Buy 2']);
});

test('a completed scan saves full text separately, and search and export read it back', async () => {
    const h = kroger.createHarness(request => kroger.jsonResponse(couponPage([
        coupon('1000001', { longDescription: 'Save on any two boxes.', requirementDescription: 'Buy 2' }),
        coupon('1000002', { longDescription: 'Save on any two boxes.' })
    ])));
    await h.loadKrogerCoupons();
    const workspaceSnapshot = h.storage.get('kroger-coupon-lite:workspace');
    assert.equal(JSON.stringify(workspaceSnapshot).includes('Save on any two boxes'), false, 'full text stays out of the workspace snapshot');
    const details = h.storage.get('kroger-coupon-lite:offer-details');
    assert.equal(details.texts.length, 2, 'repeated text is stored once');

    const storage = new Map([...h.storage].map(([key, value]) => [`issuer:kroger-coupon-lite:${key}`, value]));
    const saved = searchHarness(storage).hubReadSavedResults();
    const records = saved.records.filter(record => record.bankId === 'kroger-coupon-lite');
    assert.deepEqual(Array.from(records, record => [record.details, record.terms]),
        [['Save on any two boxes.', 'Buy 2'], ['Save on any two boxes.', '']]);

    storage.set('issuer:kroger-coupon-lite:kroger-coupon-lite:offer-details', { schemaVersion: 99 });
    const degraded = searchHarness(storage).hubReadSavedResults();
    assert.equal(degraded.records.filter(record => record.bankId === 'kroger-coupon-lite' && record.details === '').length, 2,
        'an unreadable detail store hides only the full text');
});

test('a newer detail store is preserved and blocks further requests visibly', async () => {
    const storage = new Map([['kroger-coupon-lite:offer-details', { schemaVersion: 99, keep: true }]]);
    const h = kroger.createHarness(() => kroger.jsonResponse(couponPage([coupon('1000001')])), { storage });
    await h.loadKrogerCoupons();
    assert.match(h.state.storageError, /Cannot save full offer details/);
    assert.deepEqual(h.storage.get('kroger-coupon-lite:offer-details'), { schemaVersion: 99, keep: true });
});

test('Amex full text comes from the saved groupKey; unrecognized keys have none', () => {
    const storage = crossBankStorage();
    const amex = storage.get('issuer:amex-offer-lite:card_offer_hub_amex_saved_offers_v1');
    amex.cards[0].offers.push({ ...amex.cards[0].offers[0], id: 'amex-full',
        groupKey: JSON.stringify(['MERCHANT', 'Harbor Books', 'Spend $50, get $10', 'Expires 12/31', 'Long Amex text', 'Amex terms']) });
    const records = searchHarness(storage).hubReadSavedResults().records.filter(record => record.bankId === 'amex-offer-lite');
    assert.deepEqual(Array.from(records, record => [record.details, record.terms]), [['', ''], ['Long Amex text', 'Amex terms']]);
});

test('the export holds every saved offer with coverage and no account identifiers', () => {
    const storage = crossBankStorage();
    storage.set('issuer:usbank-offer-lite:usbank-offer-lite:workspace', workspace({ offers: [offer({ merchant: 'Trail & Field', starts: '' })] }));
    const probe = searchHarness(storage);
    const exported = probe.hubBuildOfferExport(probe.hubReadSavedResults(), Date.UTC(2026, 10, 8, 9, 30));
    assert.equal(exported.format, 'card-offer-hub-offers');
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.exportedAt, '2026-11-08T09:30:00.000Z');
    assert.match(exported.release, /^\d+\.\d+\.\d+$/);
    assert.equal(exported.offers.length, 7);
    assert.equal(exported.coverage.length, 7);
    assert.equal(exported.coverage.find(entry => entry.bankId === 'kroger-coupon-lite').state, 'missing');
    assert.deepEqual(Object.keys(exported.offers[0]), ['bankId', 'bankName', 'card', 'merchant', 'description', 'details', 'terms',
        'category', 'status', 'expires', 'scannedAt', 'incomplete', 'url']);
    assert.equal(exported.offers.find(item => item.bankName === 'Citi' && item.merchant === 'Everyday Market').scannedAt, '2026-09-19T12:00:00.000Z');
    assert.doesNotMatch(JSON.stringify(exported), /synthetic-amex-card|card-citi|card-chase|scopeIdentity/);
    assert.equal(probe.hubOfferExportFileName(Date.UTC(2026, 10, 8, 9, 30)), 'card-offer-hub-offers-2026-11-08T09-30-00-000Z.json');
});
