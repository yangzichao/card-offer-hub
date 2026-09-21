function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, bank: "Deals", styles: HUB_DESIGN_STYLES,
        scopeMarkup: "<p class=\"muted\">Current signed-in Deals profile. Activation can start an expiry window; review terms first.</p><label class=\"card\"><input id=\"consent\" type=\"checkbox\" aria-label=\"Confirm activation for current Deals profile\">Allow adding offers to this profile</label>",
        workflow: { bank: "Deals", extraReviewMarkup: "", readOnly: !SETTINGS.capabilities.activation },
        onScan: scanOffers, onAdd: activateOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    panel.getElementById('consent').addEventListener('change', event => {
        if (state.busy) return;
        state.consent = event.target.checked; saveWorkspace(); renderPanel();
    });
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
