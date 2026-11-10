// Turns one bank's offers into the list to show: the small-offer filter, the
// To add / Added / All tab and the sort. Search and card selection happen before.
// items: [{ offer, reward, group: 'available' | 'added' | 'other' }].
// Returns the items to render, and when the tab or the filter empties the list,
// a sentence saying why.
// To add keeps every offer that is not on the card yet and still matters to you:
// ones Add can take, ones that need review, and Chase offers you add on Chase.
// Only skipped (ineligible, expired, informational) offers wait under All.
function hubOfferListGroup(statusLabel) {
    if (statusLabel === 'Added') return 'added';
    return ['Available', 'Not added', 'Needs review', 'Add on Chase'].includes(statusLabel) ? 'available' : 'other';
}
function hubCountOffers(count, noun = 'offer') {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
function hubOfferListView(root, items, state) {
    const view = hubNormalizeOfferView(state.offerView);
    const judged = items.map(item => ({ ...item, verdict: hubRewardFilterVerdict(item.reward, view) }));
    const passes = item => !item.verdict.startsWith('hidden');
    const counts = { available: 0, added: 0, all: 0 };
    for (const item of judged.filter(passes)) {
        counts.all++;
        if (item.group in counts) counts[item.group]++;
    }
    const tabItems = judged.filter(item => view.show === 'all' || item.group === view.show);
    const compare = hubCompareOfferRewards(view.sort);
    const shown = tabItems.filter(passes).sort((left, right) => compare(left.reward, right.reward));
    const tally = verdict => tabItems.filter(item => item.verdict === verdict).length;
    const hidden = { small: tally('hidden-small'), unlisted: tally('hidden-unlisted') };
    hubRenderOfferViewSummary(root, counts, { hidden, kept: tally('kept-unlisted'), view, error: state.offerViewError || '' });
    let emptyMessage = '';
    if (!shown.length && items.length) {
        const others = counts.all - (view.show === 'all' ? counts.all : counts[view.show]);
        const elsewhere = others ? ` See All for the other ${hubCountOffers(others)}.` : '';
        emptyMessage = hidden.small + hidden.unlisted
            ? `All ${hubCountOffers(hidden.small + hidden.unlisted)} here are hidden by your minimum value. Lower it to see them.`
            : view.show === 'available' ? `Nothing left to add.${elsewhere}`
            : view.show === 'added' ? `No added offers yet.${elsewhere}` : '';
    }
    return { items: shown, emptyMessage };
}
function hubRenderOfferViewSummary(root, counts, { hidden, kept, view, error }) {
    if (!root) return;
    for (const tab of root.querySelectorAll('input[name="hub-view-show"]')) {
        tab.setAttribute('aria-label', `${HUB_OFFER_VIEW_TAB_NAMES[tab.value]} (${counts[tab.value]})`);
        tab.closest('label').querySelector('.hub-view-count').textContent = String(counts[tab.value]);
    }
    const summary = root.getElementById('hub-view-summary');
    if (!summary) return;
    const hiddenTotal = hidden.small + hidden.unlisted;
    const skipped = view.show === 'added' ? '.' : `; Add skips ${hiddenTotal === 1 ? 'it' : 'them'}.`;
    const parts = [];
    if (hidden.small && hidden.unlisted) {
        parts.push(`${hiddenTotal} hidden (${hidden.small} below your minimum, ${hidden.unlisted} with no listed value)${skipped}`);
    } else if (hidden.small) {
        parts.push(`${hubCountOffers(hidden.small)} below your minimum ${hidden.small === 1 ? 'is' : 'are'} hidden${skipped}`);
    } else if (hidden.unlisted) {
        parts.push(`${hubCountOffers(hidden.unlisted)} with no listed value ${hidden.unlisted === 1 ? 'is' : 'are'} hidden${skipped}`);
    }
    if (kept) parts.push(`${hubCountOffers(kept)} with no listed value ${kept === 1 ? 'is' : 'are'} kept.`);
    if (error) parts.push(error);
    summary.textContent = parts.join(' ');
    summary.hidden = !summary.textContent;
}
