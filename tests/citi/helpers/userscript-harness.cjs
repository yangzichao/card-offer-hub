const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const { webcrypto } = require('node:crypto');
const { runInNewContext } = require('node:vm');
const { enrollmentResponse } = require('../fixtures/enrollment-response.cjs');

const cookieFixture = 'appVersion=synthetic; businessCode=GCB; channelId=CBOL; client_id=synthetic-client; countryCode=US; tmx_sessionid=synthetic-session';
function createHarness(respond, options = {}) {
    const source = readPublishedIssuerSource('citi-offer-lite');
    const marker = '    // --- Init ---';
    let now = 1800000000000;
    let active = 0;
    let maximumActive = 0;
    const requests = [];
    const storage = options.storage || new Map();
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = {
        TextEncoder, crypto: webcrypto, Date: TestDate, AbortController, console,
        location: { origin: 'https://online.citi.com', pathname: '/US/nga/products-offers/merchantoffers' },
        document: { cookie: options.cookie ?? cookieFixture },
        navigator: { locks: { request: async (name, config, action) => action(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            options.onSave?.(key, value);
            if (options.failStorage) throw new Error('Synthetic storage failure');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, milliseconds) {
            if (milliseconds === 45000) return 1;
            options.onWait?.(context.citiTestAccess);
            now += milliseconds;
            queueMicrotask(callback);
            return 2;
        }, clearTimeout() {},
        fetch: async (url, config) => {
            const request = { url, body: JSON.parse(config.body), headers: config.headers, startedAt: now };
            requests.push(request);
            active++;
            maximumActive = Math.max(maximumActive, active);
            try {
                const result = await respond(request, context.citiTestAccess);
                now += options.responseDelay || 0;
                request.finishedAt = now;
                return result;
            } finally { active--; }
        }
    };
    const probe = `globalThis.citiTestAccess = { state, SETTINGS, restoreWorkspace, saveWorkspace, requireWorkspaceSaved, markWorkspaceOfferPending, finishWorkspaceOffer,
        recordWorkspaceScan, workspaceScopeFingerprint, normalizeAccounts, normalizeOffers,
        enrollmentBody, enrollmentConfirmed, sessionHeaders, retryAfterMilliseconds, restorePacing,
        requestJson, refreshAllCardsAndOffers, canAddSavedOffers, setCardSelected, scanOffers, addSavedOffers, refreshAndAddOffers, stopRun };})();`;
    if (!source.includes(marker)) throw new Error('Missing test initialization boundary');
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    return { ...context.citiTestAccess, requests, storage, context, maximumActive: () => maximumActive,
        advance: milliseconds => { now += milliseconds; } };
}
function jsonResponse(payload, status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload) };
}
function offer(id, status = 'AVAILABLE', extra = {}) {
    return { offerId: id, offerStatus: status, merchantName: `Example ${id}`, offerTitle: '$5 back', offerEndDate: 'Dec 31, 2099', ...extra };
}
function listing(offers = [offer('offer-a')], cards = []) {
    return { cardArtDetails: cards, merchantOffers: [{ displayOffersCategory: 'Shopping', offers }] };
}
function confirmation(request) {
    return enrollmentResponse(request.body.offerId);
}
function selectCards(harness, ids = ['card-a']) {
    harness.state.accounts = ids.map(accountId => ({ accountId, name: `Synthetic ${accountId}` }));
    ids.forEach(id => harness.setCardSelected(id, true));
}
function seedSavedOffers(harness, ids = ['card-a'], offers = [offer('a'), offer('b')]) {
    selectCards(harness, ids);
    harness.state.offers = ids.flatMap(id => Array.from(harness.normalizeOffers(listing(offers), id)));
    harness.recordWorkspaceScan();
}
module.exports = { createHarness, cookieFixture, jsonResponse, offer, listing, confirmation, selectCards, seedSavedOffers };
