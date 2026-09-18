async function startScan() {
    if (state.busy || !state.detected) return;
    const accounts = selectedAccounts();
    if (!accounts.length) {
        setStatus('Whitelist is empty. Add a card before scanning.');
        return;
    }
    if (Date.now() < state.cooldownUntil) {
        setStatus('Scan is cooling down. Start it manually after the timer ends.');
        return;
    }
    state.busy = 'scan';
    state.cancelRequested = false;
    for (const account of accounts) {
        if (!state.offersByAccount.has(account.token)) state.scanReports.set(account.token, 'Pending');
    }
    render();
    let completedCards = 0;
    let incompleteCards = 0;
    let attemptedCards = 0;
    try {
        for (const account of accounts) {
            requireActiveRequest();
            assertWhitelisted(account.token);
            attemptedCards++;
            setStatus(`Scanning ${attemptedCards}/${accounts.length}: ${account.cardName}`);
            const { offers, viewErrors } = await scanAccountOffers(account);
            if (viewErrors.length) {
                incompleteCards++;
                viewErrors.forEach((message) => log(`${account.cardName}: ${message}`));
            } else {
                completedCards++;
                log(`${account.cardName}: ${offers.length} offers from both full lists.`);
            }
        }
        setStatus(incompleteCards
            ? `Scan finished: ${accounts.length}/${accounts.length} cards attempted; ${completedCards} complete, ${incompleteCards} incomplete. Counts for incomplete cards are partial.`
            : `Scan complete: ${completedCards}/${accounts.length} whitelist cards. Enrollment remains manual.`);
    } catch (error) {
        setStatus(`${error.message} Completed ${completedCards}/${accounts.length} cards; remaining results are incomplete.`);
        log('The scan stopped. No card was automatically removed from the whitelist.');
    } finally {
        state.busy = null;
        state.cancelRequested = false;
        render();
    }
}
