function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, template: offerWorkflow, bank: 'Kroger', styles: PANEL_STYLES,
        scopeMarkup: '<p class="muted">Clip all coupons reloads every coupon first, then clips each one Kroger allows. Nothing runs until you click.</p>',
        workflow: { bank: 'Kroger', scanLabel: 'Load coupons',
            scanDescription: 'Load your Kroger coupons without clipping. Nothing runs until you click.' },
        onScan: loadKrogerCoupons, onAdd: clipAllKrogerCoupons, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    panel.querySelector('.hub-search-rule').textContent = 'Clip all coupons includes every coupon, including ones hidden by search.';
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
