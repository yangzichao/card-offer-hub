function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, template: offerWorkflow, bank: "Chase", styles: PANEL_STYLES,
        scopeMarkup: '<div id="cards" class="cards"></div>',
        workflow: { bank: 'Chase', scanLabel: 'Load cards & offers' },
        onScan: () => state.accounts.length ? refreshAndAddOffers() : refreshAllCardsAndOffers(),
        onAdd: addSavedOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    document.body.appendChild(host);
    state.panel = panel;
    panel.querySelector('.hub-search-rule').textContent = 'Both actions add across your selected cards, including offers hidden by search.';
    renderPanel();
}
