function hubPacingDetailsMarkup() {
    return '<details class="muted"><summary aria-label="Automatic request speed details">Automatic request speed</summary><p id="hub-pacing-details"></p><button id="hub-save-debug" aria-label="Save debug log">Save debug log</button><p id="hub-debug-status" role="note">Recent timing and result codes only. No account details or credentials.</p></details>';
}
function renderHubPacingDetails(root, state) {
    const detail = root?.getElementById('hub-pacing-details');
    if (!detail || !state.pacing) return;
    const profile = state.pacing;
    const lastLimit = profile.lastRateLimitAt ? ` Last limited: ${new Date(profile.lastRateLimitAt).toLocaleString()}.` : '';
    detail.textContent = `${(profile.currentGapMs / 1000).toFixed(2)}s after each response · ${profile.successCount} successful samples in this window. Learns separately for this bank.${lastLimit}`;
    const save = root.getElementById('hub-save-debug');
    const status = root.getElementById('hub-debug-status');
    if (state.pacingDiagnostics?.storageError) status.textContent = state.pacingDiagnostics.storageError;
    save.onclick = () => {
        try {
            hubDownloadPacingDebugLog(state, save.ownerDocument);
            status.textContent = 'Debug log downloaded. Attach the JSON file when reporting a problem.';
        } catch { status.textContent = 'Download failed. Check whether the browser blocked this download and try again.'; }
    };
}
