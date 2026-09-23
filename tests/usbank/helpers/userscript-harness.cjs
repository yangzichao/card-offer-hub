const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');

const sessionFixture = { platformKeyVal: 'OLB', sourceCustomerId: 'synthetic-customer', securityToken: 'synthetic-token' };
function createHarness(respond, options = {}) {
    const source = readPublishedIssuerSource('usbank-offer-lite');
    const marker = '    // --- Init ---';
    let now = 1800000000000;
    let active = 0;
    let maximumActive = 0;
    const requests = [];
    const storage = options.storage || new Map();
    const accessToken = 'accessToken' in options ? options.accessToken : 'synthetic-access-token';
    const pageSessionValues = { offerhubobject: JSON.stringify(options.session ?? sessionFixture), AccessToken: accessToken };
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = {
        TextEncoder, crypto: webcrypto, Date: TestDate, AbortController, console,
        location: { origin: 'https://onlinebanking.usbank.com', pathname: '/digital/servicing/dominjection/cashback-deals' },
        sessionStorage: { getItem: key => key in pageSessionValues ? pageSessionValues[key] : 'synthetic-user' },
        navigator: { locks: { request: async (name, config, action) => action(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            options.onSave?.(key, value);
            if (options.failStorage) throw new Error('Synthetic storage failure');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, milliseconds) {
            if (milliseconds === 45000) return 1;
            options.onWait?.(context.usbankTestAccess);
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
                const result = await respond(request, context.usbankTestAccess);
                now += options.responseDelay || 0;
                request.finishedAt = now;
                return result;
            } finally { active--; }
        }
    };
    const probe = `globalThis.usbankTestAccess = { state, SETTINGS, restoreWorkspace, saveWorkspace, requireWorkspaceSaved, markWorkspaceOfferPending, finishWorkspaceOffer,
        recordWorkspaceScan, workspaceScopeFingerprint, normalizeListing, isActivatable,
        activationBody, activationAcknowledged, activationConfirmed, readSession, sessionHeaders,
        retryAfterMilliseconds, restorePacing, requestGraphql, scanOffers, activateSelectedOffers,
        addAllOffers, setOfferSelected, selectAllOffers, stopRun };})();`;
    if (!source.includes(marker)) throw new Error('Missing test initialization boundary');
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    return { ...context.usbankTestAccess, requests, storage, context, maximumActive: () => maximumActive,
        advance: milliseconds => { now += milliseconds; } };
}
function jsonResponse(payload, status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload) };
}
function offer(id, activationState = 'NEW', extra = {}) {
    return { offerId: id, rank: 1, ad: {
        adType: 'CASH_BACK_OFFER', adServeToken: `synthetic-serve-${id}`,
        startDate: '2020-01-01T00:00:00Z', endDate: '2099-12-31T23:59:59Z',
        merchantName: `Example ${id}`, categoryName: 'Shopping', activationState,
        visibilityState: 'VISIBLE', isAffiliateMarketing: false,
        reward: { activationModel: 'ACTIVATABLE', purchaseRequirement: { merchantUrlLinkClickRequired: false } },
        assets: { copy: { value: { headline: '$5 back' } } }, ...extra
    } };
}
function listing(offers = [offer('a')], extra = {}) {
    return { data: { getCashbackOffersAds: { requestId: 'synthetic-request', sessionTokenId: 'synthetic-deals-session', ads: offers, ...extra } } };
}
function acknowledgement() { return { data: { getActivateOffer: { requestId: 'synthetic-acknowledgement' } } }; }
function isActivation(request) { return request.body.query.includes('getActivateOffer'); }
function successfulResponder(ids = ['a', 'b']) {
    const activated = new Set();
    return request => {
        if (isActivation(request)) {
            activated.add(request.body.variables.request.clientEvents[0].clientOfferId);
            return jsonResponse(acknowledgement());
        }
        return jsonResponse(listing(ids.map(id => offer(id, activated.has(id) ? 'ACTIVATED' : 'NEW'))));
    };
}
module.exports = { createHarness, sessionFixture, jsonResponse, offer, listing, acknowledgement, isActivation, successfulResponder };
