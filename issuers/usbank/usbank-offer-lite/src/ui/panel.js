function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style><div class="panel">
      <header><h2></h2><button id="collapse" aria-label="Minimize US Bank panel">−</button></header>
      <div id="body"><section>
        <p class="muted">Cash Back Deals for this signed-in customer. Scan, select, then activate. Each activation is verified with the bank.</p>
        <div class="actions"><button id="scan" aria-label="Scan US Bank offers">Scan offers</button>
        <button id="select-all" aria-label="Select all available US Bank offers">Select all available</button>
        <button id="clear" aria-label="Clear US Bank offer selection">Clear selection</button>
        <button id="activate" class="primary" aria-label="Activate selected US Bank offers">Activate selected</button>
        <button id="stop" aria-label="Stop US Bank activation">Stop</button></div>
        <p class="muted">${SETTINGS.gapMilliseconds / 1000} seconds between requests; each activation needs a verification request. No automatic retries. Search only filters the display; select all includes hidden offers.</p>
      </section><section><p id="counts"></p><input id="search" type="search" aria-label="Search US Bank offers" placeholder="Search merchants">
      <div id="offers" class="offers"></div></section>
      <footer><p id="workspace-cache" class="muted"></p><div id="status" role="status" aria-live="polite"></div><div id="storage-error" class="error" role="alert"></div></footer></div></div>`;
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('select-all').addEventListener('click', selectAllOffers);
    panel.getElementById('clear').addEventListener('click', () => {
        if (!state.busy) { state.selected.clear(); saveWorkspace(); renderPanel(); }
    });
    panel.getElementById('activate').addEventListener('click', activateSelectedOffers);
    panel.getElementById('stop').addEventListener('click', stopRun);
    panel.getElementById('search').addEventListener('input', event => { state.search = event.target.value; saveWorkspace(); renderOffers(); });
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        saveWorkspace();
        panel.getElementById('body').hidden = state.collapsed;
        panel.getElementById('collapse').textContent = state.collapsed ? '+' : '−';
        panel.getElementById('collapse').setAttribute('aria-label', state.collapsed ? 'Expand US Bank panel' : 'Minimize US Bank panel');
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, 'US Bank');
    renderPanel();
}
