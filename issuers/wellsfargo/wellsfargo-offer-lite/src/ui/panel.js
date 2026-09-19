function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style>` + hubWorkflowMarkup(
        "<p class=\"muted\">Current signed-in Wells Fargo account. Offers needing an individual card choice are skipped.</p><label class=\"card\"><input id=\"consent\" type=\"checkbox\" aria-label=\"Allow account-wide Wells Fargo activation\">Allow adding offers to this account</label>",
        { bank: "Wells Fargo", extraReviewMarkup: "", readOnly: false });
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('consent').addEventListener('change', event => {
        if (state.busy) return;
        state.accountConsent = event.target.checked; saveWorkspace(); renderPanel();
    });
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('add').addEventListener('click', addAllOffers);
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
        button.setAttribute('aria-label', state.collapsed ? 'Expand Wells Fargo panel' : 'Minimize Wells Fargo panel');
        button.setAttribute('aria-expanded', String(!state.collapsed));
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, "Wells Fargo");
    renderPanel();
}
