function createHubWorkflowPanel({ state, settings, bank, styles, scopeMarkup, template, workflow = {},
    onScan, onAdd, onStop, saveWorkspace, renderOffers, supportsActivation = false }) {
    const host = document.createElement('div');
    host.id = settings.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${styles}</style>` + hubWorkflowMarkup(scopeMarkup,
        { ...workflow, template, bank, readOnly: !supportsActivation });
    panel.querySelector('h2').textContent = settings.name;
    panel.getElementById('scan').addEventListener('click', onScan);
    if (supportsActivation) panel.getElementById('add').addEventListener('click', onAdd);
    panel.getElementById('stop').addEventListener('click', onStop);
    const search = panel.getElementById('search');
    search.addEventListener('input', event => {
        state.search = event.target.value; saveWorkspace(); renderOffers(); hubRenderSearchControls(panel, !supportsActivation);
    });
    panel.getElementById('hub-clear-search').addEventListener('click', () => {
        state.search = ''; search.value = ''; saveWorkspace(); renderOffers(); hubRenderSearchControls(panel, !supportsActivation); search.focus();
    });
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        saveWorkspace();
        hubRestoreWorkspacePanel(panel, bank, state);
    });
    decorateHubPanel(panel, settings.version);
    hubRestoreWorkspacePanel(panel, bank, state);
    return { host, panel };
}
