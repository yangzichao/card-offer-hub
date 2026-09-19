function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style>` + hubWorkflowMarkup(
        "<p class=\"muted\">Current signed-in US Bank customer. Add all covers every available offer. You can also select individual offers below.</p>",
        { bank: "US Bank", extraReviewMarkup: "<button id=\"activate\" aria-label=\"Add selected offers\">Add selected offers</button><button id=\"select-all\" aria-label=\"Select all available offers\">Select all</button><button id=\"clear\" aria-label=\"Clear offer selection\">Clear selection</button>", readOnly: false });
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('activate').addEventListener('click', activateSelectedOffers);
    panel.getElementById('select-all').addEventListener('click', selectAllOffers);
    panel.getElementById('clear').addEventListener('click', () => {
        if (!state.busy) { state.selected.clear(); saveWorkspace(); renderPanel(); }
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
        button.setAttribute('aria-label', state.collapsed ? 'Expand US Bank panel' : 'Minimize US Bank panel');
        button.setAttribute('aria-expanded', String(!state.collapsed));
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, "US Bank");
    renderPanel();
}
