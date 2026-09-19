const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = () => readFileSync(resolve(__dirname, '../../../dist/bofa-offer-lite.user.js'), 'utf8');
const token = (claims = {}) => `synthetic.${Buffer.from(JSON.stringify({ exp: 9999999999, featureFlags: { dxlEnabled: true }, ...claims })).toString('base64url')}.not-a-signature`;
const offer = (id = '101', extra = {}) => ({
    id, offer_id: id, merchant_name: `Synthetic Merchant ${id}`, headline: '$5 back',
    type: 'CARD_LINKED', activation_required: true, activation_type: 'CLICK',
    activation_triggers: ['OFFER_DETAILS_CLICK'], is_activated: false, ...extra
});
const jsonResponse = (payload, status = 200, retryAfter = null) => ({
    status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload)
});
function createHarness(respond, options = {}) {
    let now = 1800000000000;
    const requests = [];
    const storage = options.storage || new Map();
    let session = options.token ?? token();
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = {
        Date: TestDate, AbortController, URLSearchParams, atob,
        location: { origin: 'https://deals.merchant-rewards.com', search: '' },
        localStorage: { getItem: () => session },
        navigator: { locks: { request: async (name, config, callback) => callback(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            if (options.failStorage) throw new Error('Synthetic storage error');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, delay) {
            if (delay === 45000) return 1;
            options.onWait?.(context.testAccess);
            now += delay;
            queueMicrotask(callback);
            return 2;
        }, clearTimeout() {},
        fetch: async (path, config) => {
            const request = { path, ...config, body: config.body === undefined ? undefined : JSON.parse(config.body), startedAt: now };
            requests.push(request);
            const response = await respond(request, context.testAccess);
            const originalText = response.text;
            response.text = async () => {
                const text = await originalText();
                now += options.responseDelay || 0;
                request.finishedAt = now;
                return text;
            };
            return response;
        }
    };
    const compiled = source();
    const marker = '    // --- Init ---';
    if (!compiled.includes(marker)) throw new Error('Missing initialization boundary');
    runInNewContext(compiled.slice(0, compiled.indexOf(marker)) + `globalThis.testAccess = {
        state, SETTINGS, normalizeOffer, normalizeLocation, normalizePage, normalizeDetail,
        currentSessionToken, retryAfterMilliseconds, requestJson, restorePacing, scanOffers, activateOffers, stopRun
    };})();`, context);
    return { ...context.testAccess, requests, storage, setSession: value => { session = value; }, advance: delay => { now += delay; } };
}
function responder(offers = [offer()], mode = 'success') {
    const activated = new Set();
    return request => {
        if (request.path === '/geo') return jsonResponse({ latitude: 0, longitude: 0 });
        if (request.path === '/api/offers-search') return jsonResponse({ offers: offers.slice(request.body.page_offset, request.body.page_offset + 24), total: offers.length });
        if (request.path === '/api/offers-details') {
            const raw = offers.find(item => item.offer_id === request.body.offer_id);
            return jsonResponse({ offer: { ...raw, is_activated: mode === 'readback' ? false : activated.has(raw.offer_id) } });
        }
        if (request.method === 'PUT') {
            activated.add(request.path.split('/').pop());
            return mode === '429' ? jsonResponse({}, 429, '600') : jsonResponse(mode === 'unknown' ? {} : { ok: true });
        }
        throw new Error('Unexpected fixture request');
    };
}
module.exports = { source, token, offer, jsonResponse, createHarness, responder };
