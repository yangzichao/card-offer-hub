function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style><div class="panel">
      <header><h2></h2><button id="collapse" aria-label="Minimize Citi panel">−</button></header>
      <div id="body"><section>
        <p class="muted">Select cards, then add all available Merchant Offers. 0.5 seconds between completed requests. No automatic retries.</p>
        <button id="detect" aria-label="Detect Citi cards">Detect cards</button>
        <div id="cards" class="cards"></div>
        <div class="actions"><button id="scan" aria-label="Scan selected Citi cards">Scan selected</button>
        <button id="add" class="primary" aria-label="Scan and add all Citi offers">Scan & add all</button>
        <button id="stop" aria-label="Stop Citi enrollment">Stop</button></div>
        <p class="muted">All selected cards are processed. Search below only filters the display.</p>
      </section><section><p id="counts"></p><input id="search" type="search" aria-label="Search Citi offers" placeholder="Search merchants">
      <div id="offers" class="offers"></div></section>
      <footer><p id="workspace-cache" class="muted"></p><div id="status" role="status" aria-live="polite"></div><div id="storage-error" class="error" role="alert"></div></footer></div></div>`;
    panel.querySelector('h2').textContent = SETTINGS.name;
    panel.getElementById('detect').addEventListener('click', detectCards);
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('add').addEventListener('click', addAllOffers);
    panel.getElementById('stop').addEventListener('click', stopRun);
    panel.getElementById('search').addEventListener('input', event => { state.search = event.target.value; saveWorkspace(); renderOffers(); });
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        saveWorkspace();
        panel.getElementById('body').hidden = state.collapsed;
        panel.getElementById('collapse').textContent = state.collapsed ? '+' : '−';
        panel.getElementById('collapse').setAttribute('aria-label', state.collapsed ? 'Expand Citi panel' : 'Minimize Citi panel');
    });
    decorateHubPanel(panel, SETTINGS.version);
    document.body.appendChild(host);
    state.panel = panel;
    restoreWorkspacePanel(panel, 'Citi');
    renderPanel();
}
