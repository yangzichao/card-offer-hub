function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style><div class="panel">
      <header><h2></h2><button id="collapse" aria-label="Minimize Wells Fargo panel">−</button></header>
      <div id="body"><section>
        <p class="muted">Scan My Wells Fargo Deals, then activate eligible offers. 0.5 seconds between completed requests. No automatic retries.</p>
        <label class="card"><input id="consent" type="checkbox" aria-label="Allow account-wide Wells Fargo activation">Activate eligible offers for this signed-in account.</label>
        <p class="muted">This API has no per-card selection. Offers requiring a card choice are skipped.</p>
        <div class="actions"><button id="scan" aria-label="Scan Wells Fargo offers">Scan offers</button>
        <button id="add" class="primary" aria-label="Scan and add all Wells Fargo offers">Scan & add all</button>
        <button id="stop" aria-label="Stop Wells Fargo activation">Stop</button></div>
        <p class="muted">Search only filters the display; all eligible account offers are processed.</p>
      </section><section><p id="counts"></p><input id="search" type="search" aria-label="Search Wells Fargo offers" placeholder="Search merchants">
      <div id="offers" class="offers"></div></section>
      <footer><p id="workspace-cache" class="muted"></p><div id="status" role="status" aria-live="polite"></div><div id="storage-error" class="error" role="alert"></div></footer></div></div>`;
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('add').addEventListener('click', addAllOffers);
    panel.getElementById('stop').addEventListener('click', stopRun);
    panel.getElementById('consent').addEventListener('change', event => {
        if (state.busy) return;
        state.accountConsent = event.target.checked;
        saveWorkspace();
        renderPanel();
    });
    panel.getElementById('search').addEventListener('input', event => { state.search = event.target.value; saveWorkspace(); renderOffers(); });
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        saveWorkspace();
        panel.getElementById('body').hidden = state.collapsed;
        panel.getElementById('collapse').textContent = state.collapsed ? '+' : '−';
        panel.getElementById('collapse').setAttribute('aria-label', state.collapsed ? 'Expand Wells Fargo panel' : 'Minimize Wells Fargo panel');
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, 'Wells Fargo');
    renderPanel();
}
