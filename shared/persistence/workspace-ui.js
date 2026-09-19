function workspaceCacheNotice() {
    if (!state.lastScanAt) return 'Results and selections are saved locally. Nothing runs automatically.';
    return `Last complete scan: ${new Date(state.lastScanAt).toLocaleString()}. ${state.restoredWorkspace || state.needsScan
        ? 'Saved results; scan again before adding.' : 'Results and selections saved locally.'}`;
}
function restoreWorkspacePanel(panel, bankName) {
    const search = panel.getElementById('search');
    if (search) search.value = state.search || '';
    panel.getElementById('body').hidden = state.collapsed;
    const toggle = panel.getElementById('collapse');
    toggle.textContent = state.collapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
    toggle.setAttribute('aria-label', `${state.collapsed ? 'Expand' : 'Minimize'} ${bankName} panel`);
}
