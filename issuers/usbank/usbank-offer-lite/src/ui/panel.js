function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, bank: "US Bank", styles: PANEL_STYLES,
        scopeMarkup: "<p class=\"muted\">Current signed-in US Bank customer. Add all covers every available offer. You can also select individual offers below.</p>",
        workflow: { bank: "US Bank", extraReviewMarkup: "<button id=\"activate\" aria-label=\"Add selected offers\">Add selected offers</button><button id=\"select-all\" aria-label=\"Select all available offers\">Select all</button><button id=\"clear\" aria-label=\"Clear offer selection\">Clear selection</button>", readOnly: !SETTINGS.capabilities.activation },
        onScan: scanOffers, onAdd: addAllOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    panel.getElementById('activate').addEventListener('click', activateSelectedOffers);
    panel.getElementById('select-all').addEventListener('click', selectAllOffers);
    panel.getElementById('clear').addEventListener('click', () => {
        if (!state.busy) { state.selected.clear(); saveWorkspace(); renderPanel(); }
    });
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
