async function detectCards({ forceRefresh = false } = {}) {
    if (state.busy || (state.detected && !forceRefresh) || Date.now() < state.discoveryRetryAt || Date.now() < state.cooldownUntil) return;
    state.busy = 'detect';
    state.cancelRequested = false;
    render();
    setStatus(forceRefresh ? 'Refreshing the card list. Your whitelist will be kept.' : 'Detecting card list once. Offers will not be scanned.');
    try {
        const snapshot = await detectAccountSnapshot({ forceRefresh });
        requireActiveRequest();
        state.accounts = snapshot.accounts;
        state.detected = true;
        // Missing cards keep their saved approval, but only cards in this catalog
        // can be selected for scanning. New card tokens are never opted in.
        persistCardSettings();
        log(`Detected ${state.accounts.length} cards from ${snapshot.source}.`);
        setStatus(forceRefresh
            ? `Refreshed ${state.accounts.length} cards. Existing whitelist selections kept; new cards are unchecked.`
            : `Detected ${state.accounts.length} cards. Add cards to the whitelist, then scan manually.`);
    } catch (error) {
        state.discoveryRetryAt = Date.now() + SETTINGS.requestGapMs;
        setStatus(`${forceRefresh ? 'Card refresh failed; previous cards and whitelist kept' : 'Card detection failed'}: ${error.message}`);
    } finally {
        state.busy = null;
        render();
    }
}

function setCardWhitelisted(accountToken, allowed) {
    if (state.busy || !state.detected || !state.accounts.some((account) => account.token === accountToken)) return;
    if (allowed) state.whitelist.add(accountToken);
    else state.whitelist.delete(accountToken);
    persistCardSettings();
    setStatus(`${selectedAccounts().length} cards in whitelist. No scan has been started by this change.`);
    render();
}

function cancelRun() {
    if (!state.busy) return;
    state.cancelRequested = true;
    setStatus('Stopping. An already-sent request may finish; no new requests or retries will start.');
    renderControls();
}
