function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${HUB_DESIGN_STYLES}</style>` + hubWorkflowMarkup(
        "<p class=\"muted\">Current signed-in Deals profile. Activation can start an expiry window; review terms first.</p><label class=\"card\"><input id=\"consent\" type=\"checkbox\" aria-label=\"Confirm activation for current Deals profile\">Allow adding offers to this profile</label>",
        { bank: "Deals", extraReviewMarkup: "", readOnly: false });
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('consent').addEventListener('change', event => {
        if (state.busy) return;
        state.consent = event.target.checked; saveWorkspace(); renderPanel();
    });
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('add').addEventListener('click', activateOffers);
    panel.getElementById('stop').addEventListener('click', stopRun);
    const search = panel.getElementById('search');
    search.addEventListener('input', event => { state.search = event.target.value; saveWorkspace(); renderOffers(); });
    panel.getElementById('hub-clear-search').onclick = () => {
        state.search = ''; search.value = ''; saveWorkspace(); renderOffers(); search.focus();
    };
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        saveWorkspace();
        panel.getElementById('body').hidden = state.collapsed;
        const button = panel.getElementById('collapse');
        button.textContent = state.collapsed ? '+' : '−';
        button.setAttribute('aria-label', state.collapsed ? 'Expand Deals panel' : 'Minimize Deals panel');
        button.setAttribute('aria-expanded', String(!state.collapsed));
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, "Deals");
    renderPanel();
}
