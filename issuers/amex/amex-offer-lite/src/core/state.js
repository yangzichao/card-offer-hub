const SETTINGS = Object.freeze({
    version: __USERSCRIPT_VERSION__,
    requestGapMs: 500,
    rateLimitCooldownMs: 120000,
    requestTimeoutMs: 30000,
    savedCardsKey: 'card_offer_hub_amex_saved_cards_v1',
    savedOffersKey: 'card_offer_hub_amex_saved_offers_v1',
    cooldownKey: 'card_offer_hub_amex_cooldown_v1',
    functionsBase: 'https://functions.americanexpress.com'
});

const state = {
    accounts: [],
    detected: false,
    whitelist: new Set(),
    cardPriority: [],
    savedCardsReady: false,
    savedCardsError: '',
    offersByAccount: new Map(),
    scanReports: new Map(),
    offerScanTimes: new Map(),
    pendingEnrollments: new Set(),
    savedOffersError: '',
    busy: null,
    enrollmentProgress: { total: 0, completed: 0 },
    cancelRequested: false,
    requestInFlight: false,
    nextRequestAt: 0,
    cooldownUntil: 0,
    discoveryRetryAt: 0,
    filter: '',
    minimized: false,
    status: 'Ready. Detect cards first; no requests run automatically.',
    logs: []
};

let panelRoot = null;

function setStatus(message) {
    state.status = message;
    renderStatus();
}

function log(message) {
    state.logs.push(message);
    state.logs = state.logs.slice(-40);
    renderStatus();
}

// Whitelist cards in the order you ranked them, so scanning and enrollment both
// work through your preferred cards first.
function selectedAccounts() {
    return prioritizedAccounts().filter((account) => state.whitelist.has(account.token));
}

function assertWhitelisted(accountToken) {
    if (!state.detected || !selectedAccounts().some((account) => account.token === accountToken)) {
        throw new Error('This card is not in the detected whitelist.');
    }
}
