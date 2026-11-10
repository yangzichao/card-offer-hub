function createHubWorkflowPanel({ state, settings, bank, styles, scopeMarkup, template, workflow = {},
    onScan, onAdd, onStop, saveWorkspace, renderOffers, renderPanel = renderOffers, supportsActivation = false, offerViewStorage = null }) {
    const host = document.createElement('div');
    host.id = settings.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${styles}</style>` + hubWorkflowMarkup(scopeMarkup,
        { ...workflow, template, bank, readOnly: !supportsActivation, offerView: Boolean(offerViewStorage) });
    panel.querySelector('h2').textContent = settings.name;
    if (offerViewStorage) {
        // The minimums change the Add counts too, so the whole panel redraws.
        hubBindOfferView(panel, { state, render: renderPanel,
            store: createHubOfferViewStore({ storage: offerViewStorage, storageKey: `${settings.id}:reward-filter` }) });
    }
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
