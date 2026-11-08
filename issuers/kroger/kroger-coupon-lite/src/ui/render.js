function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const visible = state.offers.filter(offer => hubMatchesSearch(offer, search));
    if (!visible.length) hubShowEmptyOffers(container, search);
    for (const offer of visible) {
        container.appendChild(hubOfferRow({ merchant: offer.merchant, title: offer.title,
            status: hubOfferStatusLabel(offer.status), meta: [hubOfferExpiry(offer.expires.slice(0, 10)), offer.category] }));
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    renderHubPacingDetails(panel, state);
    panel.getElementById('workspace-cache').textContent = workspaceCacheNotice();
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const runSummary = state.total ? ` · ${state.confirmed}/${state.total} clipped this run` : '';
    panel.getElementById('counts').textContent = `${state.offers.length} coupons · ${krogerCouponCount('AVAILABLE')} ready · ${krogerCouponCount('ACTIVATED')} clipped${runSummary}`;
    renderKrogerActions(panel);
    renderOffers();
}
