function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, template: offerWorkflow, bank: "Citi", styles: PANEL_STYLES,
        scopeMarkup: '<div id="cards" class="cards"></div>',
        workflow: { bank: 'Citi', scanLabel: 'Load cards & offers' },
        onScan: () => state.accounts.length ? refreshAndAddOffers() : refreshAllCardsAndOffers(),
        onAdd: addSavedOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    document.body.appendChild(host);
    state.panel = panel;
    // Progress and failures must remain next to the actions, above long offer lists.
    const actions = panel.querySelector('.hub-primary-actions');
    actions.after(panel.getElementById('status'), panel.getElementById('storage-error'));
    panel.querySelector('.hub-search-rule').textContent = 'Both actions add across your selected cards, including offers hidden by search.';
    renderPanel();
}
