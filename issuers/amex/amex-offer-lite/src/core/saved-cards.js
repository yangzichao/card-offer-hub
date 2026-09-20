const SAVED_CARDS_SCHEMA_VERSION = 2;

function validateSavedCards(snapshot) {
    if (!snapshot || ![1, SAVED_CARDS_SCHEMA_VERSION].includes(snapshot.schemaVersion) || typeof snapshot.detected !== 'boolean' ||
        !Array.isArray(snapshot.accounts) || !Array.isArray(snapshot.whitelist)) {
        throw new Error('Saved card settings have an unrecognized format.');
    }
    const validString = (value) => typeof value === 'string' && value.length > 0;
    // v1 stored no offer priority. Detection order becomes the starting order, so
    // upgrading never reshuffles cards and never sends a request.
    const priorityOrder = snapshot.schemaVersion === 1 ? snapshot.accounts.map((account) => account.token) : snapshot.priorityOrder;
    if (snapshot.accounts.some((account) => !account || !validString(account.token) || !validString(account.cardName)) ||
        snapshot.whitelist.some((token) => !validString(token)) ||
        !Array.isArray(priorityOrder) || priorityOrder.some((token) => !validString(token)) ||
        new Set(priorityOrder).size !== priorityOrder.length ||
        new Set(snapshot.accounts.map((account) => account.token)).size !== snapshot.accounts.length ||
        (snapshot.detected && !snapshot.accounts.length) || (!snapshot.detected && snapshot.accounts.length)) {
        throw new Error('Saved card settings are incomplete or invalid.');
    }
    return {
        accounts: snapshot.accounts.map(({ token, cardName }) => ({ token, cardName })),
        whitelist: new Set(snapshot.whitelist),
        cardPriority: priorityOrder,
        detected: snapshot.detected
    };
}

function reportCardStorageError(message) {
    state.savedCardsError = message;
    log(message);
}

function persistCardSettings() {
    try {
        // Store one snapshot so the catalog, the explicit approvals and the offer
        // priority stay together and can never restore out of step with each other.
        GM_setValue(SETTINGS.savedCardsKey, {
            schemaVersion: SAVED_CARDS_SCHEMA_VERSION,
            detected: state.detected,
            accounts: state.accounts.map(({ token, cardName }) => ({ token, cardName })),
            whitelist: [...state.whitelist],
            priorityOrder: normalizeCardPriority()
        });
        state.savedCardsReady = true;
        state.savedCardsError = '';
        return true;
    } catch {
        reportCardStorageError('Could not save cards and whitelist. Changes apply to this page only; check Tampermonkey storage.');
        return false;
    }
}

function restoreSavedCards() {
    try {
        const snapshot = GM_getValue(SETTINGS.savedCardsKey, null);
        if (snapshot !== null) {
            Object.assign(state, validateSavedCards(snapshot));
            state.savedCardsReady = true;
        }
        if (state.detected) {
            normalizeCardPriority();
            state.status = `Restored ${state.accounts.length} cards, ${selectedAccounts().length} whitelist selections and your offer priority. Ready to scan manually.`;
        } else if (state.whitelist.size) {
            state.status = 'Your whitelist is saved. Detect the card list once to display your existing selections.';
        }
    } catch {
        reportCardStorageError('Could not restore saved cards and whitelist. Saved data was not overwritten; check Tampermonkey storage.');
    }
}
