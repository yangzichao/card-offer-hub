function cardRow(account, index, cardCount) {
    const row = element('div', '', 'card');
    row.append(cardDragHandle(account));
    row.append(element('span', `${index + 1}`, 'card-rank'));
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.whitelist.has(account.token);
    checkbox.disabled = Boolean(state.busy);
    checkbox.setAttribute('aria-label', `Whitelist ${account.cardName}`);
    checkbox.onchange = () => setCardWhitelisted(account.token, checkbox.checked);
    const details = element('div', '', 'card-info');
    details.append(element('div', account.cardName));
    details.append(element('div', state.scanReports.get(account.token) || (checkbox.checked ? 'Whitelisted · not scanned' : 'Not whitelisted'), 'card-report'));
    const counts = accountOfferCounts(account.token);
    if (counts) {
        details.append(element('div', `${counts.complete ? '' : 'Observed so far: '}${counts.eligible} eligible · ${counts.enrolled} added · ${counts.total} total`, 'card-counts'));
        const scannedAt = state.offerScanTimes.get(account.token);
        if (scannedAt) details.append(element('div', `Last scan: ${new Date(scannedAt).toLocaleString()}`, 'card-report'));
    }
    row.append(checkbox, details, cardPriorityControls(account, index, cardCount));
    makeCardDropTarget(row, account);
    return row;
}

function renderCards() {
    const list = uiElement('card-list');
    if (!list) return;
    list.replaceChildren();
    const count = selectedAccounts().length;
    uiElement('whitelist-summary').textContent = state.detected
        ? `${count} of ${state.accounts.length} cards selected, highest offer priority first. Only checked cards are scanned or enrolled.`
        : 'Detect cards to choose them. New cards are never selected automatically.';
    const missingCount = state.whitelist.size - count;
    if (state.detected && missingCount) {
        uiElement('whitelist-summary').textContent += ` ${missingCount} saved selections are absent from this card list and will not be scanned.`;
    }
    const savedCardsStatus = uiElement('saved-cards-status');
    savedCardsStatus.textContent = state.savedCardsError || (state.savedCardsReady
        ? 'Saved in Tampermonkey. Your cards, whitelist and offer priority survive page reloads.'
        : 'Your card list, whitelist and offer priority will be saved after detection.');
    savedCardsStatus.className = `${state.savedCardsError ? 'storage-error' : 'muted'} hub-fine-print`;
    const accounts = prioritizedAccounts();
    accounts.forEach((account, index) => list.append(cardRow(account, index, accounts.length)));
}
