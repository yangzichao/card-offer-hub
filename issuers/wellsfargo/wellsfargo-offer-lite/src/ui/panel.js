function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const { host, panel } = createHubWorkflowPanel({
        state, settings: SETTINGS, template: offerWorkflow, bank: "Wells Fargo", styles: PANEL_STYLES,
        scopeMarkup: "<p class=\"muted\">Offers needing an individual card choice are skipped.</p><label class=\"card\"><input id=\"consent\" type=\"checkbox\" aria-label=\"Allow account-wide Wells Fargo activation\">Allow adding offers to this account</label>",
        workflow: { bank: "Wells Fargo", extraReviewMarkup: "", readOnly: !SETTINGS.capabilities.activation },
        onScan: scanOffers, onAdd: addAllOffers, onStop: stopRun,
        saveWorkspace, renderOffers, supportsActivation: SETTINGS.capabilities.activation
    });
    panel.getElementById('consent').addEventListener('change', event => {
        if (state.busy) return;
        state.accountConsent = event.target.checked; saveWorkspace(); renderPanel();
    });
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
