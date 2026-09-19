const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { randomUUID } = require('node:crypto');

function createUserscriptHarness(fetchResponse = () => { throw new Error('Unexpected request'); }, options = {}) {
    const source = readFileSync(resolve(__dirname, '../../../dist/amex-offer-lite.user.js'), 'utf8');
    const marker = '    // --- Init ---';
    if (!source.includes(marker)) throw new Error('Update the test probe for the new initialization boundary.');
    let now = 1700000000000;
    let maximumActiveRequests = 0;
    let activeRequests = 0;
    const requests = [];
    const storage = options.storage || new Map();
    const userscriptStorage = options.userscriptStorage || new Map();
    class ClockDate extends Date {
        constructor(...arguments_) { super(...(arguments_.length ? arguments_ : [now])); }
        static now() { return now; }
    }
    const context = {
        window: { __INITIAL_STATE__: options.initialState },
        ...(options.pageWindow ? { unsafeWindow: options.pageWindow } : {}),
        GM_getValue(key, defaultValue) {
            if (options.storageReadError) throw new Error('Synthetic userscript read failure');
            return structuredClone(userscriptStorage.get(key) ?? defaultValue);
        },
        GM_setValue(key, value) {
            if (options.storageWriteError) throw new Error('Synthetic userscript write failure');
            userscriptStorage.set(key, structuredClone(value));
        },
        document: { getElementById: () => null },
        localStorage: {
            getItem: (key) => {
                if (options.localStorageReadError) throw new Error('Synthetic site storage failure');
                return storage.get(key) ?? null;
            },
            setItem: (key, value) => storage.set(key, value)
        },
        fetch: async (url, requestOptions) => {
            const request = { url, options: requestOptions, startedAt: now, body: requestOptions.body ? JSON.parse(requestOptions.body) : null };
            requests.push(request);
            activeRequests++;
            maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
            try { return await fetchResponse(request, requests.length); }
            finally { activeRequests--; }
        },
        crypto: { randomUUID }, AbortController, Date: ClockDate,
        setTimeout(callback, duration) {
            if (duration === 30000) return 1; // Request timeout: responses are deterministic in unit tests.
            options.onWait?.(duration, context.amexTestAccess);
            now += duration;
            queueMicrotask(callback);
            return 2;
        },
        clearTimeout() {}, console
    };
    const probe = `
    globalThis.amexTestAccess = {
        state, SETTINGS, restoreViewSettings, persistViewSettings, SAVED_VIEW_SETTINGS_KEY, restoreLocalSettings, selectedAccounts, decodePageState, readPageState, accountsFromPage,
        normalizeAccounts, detectCards, setCardWhitelisted, startScan, getAllOffersForAccount,
        offersInSection, normalizeHubOffer, requestJson, retryAfterMilliseconds, cancelRun,
        enrollOffer, cardEnrollmentBody, cardEnrollmentStatus, enrollmentUserOffset, startEnrollment, enrollmentCandidates, groupedOffers,
        enrollmentPlan, prioritizedAccounts, cardPriorityRanks, normalizeCardPriority, moveCardPriority, dropCardPriority, persistCardSettings,
        accountOfferCounts, offerGroupCounts, filteredOfferSummary
    };
})();`;
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    return {
        ...context.amexTestAccess, requests, storage, userscriptStorage, window: context.window,
        advanceTime: (duration) => { now += duration; },
        maximumActiveRequests: () => maximumActiveRequests
    };
}

function jsonResponse(payload, status = 200, headers = {}) {
    return { status, ok: status >= 200 && status < 300, json: async () => payload,
        headers: { get: (name) => headers[name] || null } };
}

function configureAccounts(harness, tokens = ['card-a'], whitelist = tokens) {
    harness.state.accounts = tokens.map((token) => ({ token, cardName: `Test ${token}` }));
    harness.state.detected = true;
    harness.state.whitelist = new Set(whitelist);
}

module.exports = { createUserscriptHarness, jsonResponse, configureAccounts };
