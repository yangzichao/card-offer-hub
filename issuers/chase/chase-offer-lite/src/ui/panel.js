function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, template: offerWorkflow, bank: "Chase", styles: PANEL_STYLES,
        scopeMarkup: "<p class=\"muted\">Open Chase Offers, then detect and choose your cards. Your choices stay saved.</p><button id=\"detect\" aria-label=\"Detect cards\">Detect cards</button><div id=\"cards\" class=\"cards\"></div>",
        workflow: { bank: "Chase", extraReviewMarkup: "", readOnly: !SETTINGS.capabilities.activation },
        onScan: scanOffers, onAdd: addAllOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    panel.getElementById('detect').addEventListener('click', detectCards);
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
