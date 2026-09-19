function offerTargetLine(group, plannedOffer) {
    if (plannedOffer) {
        const otherEligibleCards = new Set(group.accounts
            .filter(({ account, offer }) => offer.status === 'ELIGIBLE' && account.token !== plannedOffer.account.token)
            .map(({ account }) => account.token)).size;
        return element('p', `Goes to ${plannedOffer.account.cardName}`
            + (otherEligibleCards ? ` · ${otherEligibleCards} other eligible ${otherEligibleCards === 1 ? 'card is' : 'cards are'} skipped` : ''),
        'offer-target');
    }
    const settledCard = group.accounts.find(({ offer }) => ['ENROLLED', 'UNCONFIRMED'].includes(offer.status));
    if (!settledCard) return null;
    return element('p', `${settledCard.offer.status === 'ENROLLED' ? 'Already on' : 'Unconfirmed on'} ${settledCard.account.cardName}`
        + ' · no other card will be used for this offer', 'offer-target');
}

function offerEnrollButton(group, plannedOffer) {
    const { offer, accounts } = group;
    const control = element('button', 'View on Amex');
    control.type = 'button';
    control.disabled = Boolean(state.busy) || !plannedOffer || Date.now() < state.cooldownUntil;
    if (plannedOffer) control.textContent = 'Add';
    else if (accounts.some(({ offer: accountOffer }) => accountOffer.status === 'ENROLLED')) control.textContent = 'Added';
    else if (accounts.some(({ offer: accountOffer }) => ['UNCONFIRMED', 'FAILED'].includes(accountOffer.status))) control.textContent = 'Rescan to verify';
    else if (offer.enrollable && accounts.some(({ offer: accountOffer }) => accountOffer.status === 'ELIGIBLE')) control.textContent = 'Finish scan first';
    control.setAttribute('aria-label', control.textContent);
    control.onclick = () => startEnrollment(offer.groupKey);
    return control;
}

function renderOffers() {
    const list = uiElement('offer-list');
    if (!list) return;
    list.replaceChildren();
    const groups = groupedOffers();
    // Allocate once for the whole list; every tile reads its own card from the plan.
    const plannedByOffer = new Map(enrollmentPlan().map((plannedOffer) => [plannedOffer.offer.groupKey, plannedOffer]));
    const summary = uiElement('offer-summary');
    if (summary) summary.textContent = filteredOfferSummary(groups, groups.filter(group => plannedByOffer.has(group.offer.groupKey)).length);
    const savedStatus = uiElement('saved-offers-status');
    const scanTimes = selectedAccounts().map((account) => state.offerScanTimes.get(account.token)).filter((time) => time > 0);
    savedStatus.textContent = state.savedOffersError || (scanTimes.length
        ? `Last scan: ${new Date(Math.max(...scanTimes)).toLocaleString()}. Results stay saved until you refresh manually.` : '');
    savedStatus.className = state.savedOffersError ? 'storage-error' : 'muted';
    if (!groups.length) {
        list.append(element('p', state.offersByAccount.size ? 'No offers match this filter.' : 'Scanned offers will appear here.', 'muted'));
        return;
    }
    for (const group of groups) {
        const { offer, accounts } = group;
        const plannedOffer = plannedByOffer.get(offer.groupKey);
        const item = element('article', '', 'offer');
        const title = element('div', '', 'offer-title');
        title.append(element('strong', offer.name));
        title.append(offerEnrollButton(group, plannedOffer));
        item.append(title, element('p', offer.description, 'muted'));
        const counts = offerGroupCounts(accounts);
        item.append(element('p', `Eligible on ${counts.eligibleCards} cards · Added on ${counts.enrolledCards} · Seen on ${counts.seenCards}`, 'offer-counts'));
        const target = offerTargetLine(group, plannedOffer);
        if (target) item.append(target);
        if (offer.expiry) item.append(element('p', offer.expiry, 'muted'));
        if (!offer.enrollable) item.append(element('p', 'Informational offer · open Amex to view its terms.', 'muted'));
        const badges = element('div', '', 'badges');
        for (const { account, offer: accountOffer } of accounts) {
            badges.append(element('span', `${account.cardName} · ${accountOffer.enrollable ? hubOfferStatusLabel(accountOffer.status) : "Skipped"}`, `badge ${accountOffer.status.toLowerCase()}`));
        }
        item.append(badges);
        list.append(item);
    }
}
