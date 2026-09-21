function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, bank: "Citi", styles: PANEL_STYLES,
        scopeMarkup: '<p class="muted">Choose cards for adding offers. Your choices stay saved; new cards start unselected.</p><div id="cards" class="cards"></div>',
        workflow: { bank: 'Citi', scanLabel: 'Refresh all cards & offers',
            scanDescription: 'Optional: refresh every card and its offers in one click, including unselected cards. Your saved choices stay selected; refreshing does not add offers.' },
        onScan: refreshAllCardsAndOffers, onAdd: addAllOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
