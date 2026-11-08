const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');
const { contextHeaders } = require('../fixtures/coupons.cjs');

const accountKeys = JSON.stringify(['synthetic-home-account.synthetic-tenant-login.example']);
function createHarness(respond, options = {}) {
    const source = readPublishedIssuerSource('kroger-coupon-lite');
    const marker = '    // --- Init ---';
    let now = 1800000000000;
    let active = 0;
    let maximumActive = 0;
    const requests = [];
    const storage = options.storage || new Map();
    const pageStorage = new Map([['msal.2.account.keys', options.accountKeys === undefined ? accountKeys : options.accountKeys]]);
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = {
        TextEncoder, URL, URLSearchParams, crypto: webcrypto, Date: TestDate, AbortController, console,
        location: { origin: options.origin || 'https://www.kroger.com', pathname: '/savings/cl/coupons/' },
        localStorage: { getItem: key => pageStorage.has(key) ? pageStorage.get(key) : null },
        navigator: { locks: { request: async (name, config, action) => action(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            if (options.failStorage) throw new Error('Synthetic storage failure');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, milliseconds) {
            if (milliseconds === 30000) return 1;
            options.onWait?.(context.krogerTestAccess);
            now += milliseconds;
            queueMicrotask(callback);
            return 2;
        }, clearTimeout() {},
        fetch: async (url, config) => {
            const request = { url, method: config.method, headers: config.headers,
                body: config.body === undefined ? undefined : JSON.parse(config.body), startedAt: now };
            requests.push(request);
            active++;
            maximumActive = Math.max(maximumActive, active);
            try {
                const result = await respond(request, context.krogerTestAccess);
                request.finishedAt = now;
                return result;
            } finally { active--; }
        }
    };
    const probe = `globalThis.krogerTestAccess = { state, SETTINGS, offerWorkflow, restoreWorkspace, saveWorkspace,
        captureKrogerContext, krogerContextHeaders, readKrogerAccountKey, krogerCouponPageUrl, normalizeKrogerCoupon,
        normalizeKrogerCouponPage, mergeKrogerCoupons, krogerClipConfirmed, restorePacing,
        loadKrogerCoupons, clipAllKrogerCoupons, stopRun };})();`;
    if (!source.includes(marker)) throw new Error('Missing test initialization boundary');
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    const access = context.krogerTestAccess;
    if (options.captureContext !== false) access.captureKrogerContext('/atlas/v1/savings-coupons/v2/coupons?page.offset=0', contextHeaders);
    return { ...access, requests, storage, pageStorage, context, maximumActive: () => maximumActive,
        advance: milliseconds => { now += milliseconds; } };
}
function jsonResponse(payload, status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload) };
}
function isClip(request) {
    return request.method === 'POST' && new URL(request.url, 'https://www.kroger.com').pathname === '/atlas/v1/savings-coupons/v1/clip-unclip';
}
function requestOffset(request) {
    return Number(new URL(request.url, 'https://www.kroger.com').searchParams.get('page.offset'));
}
module.exports = { createHarness, jsonResponse, isClip, requestOffset };
