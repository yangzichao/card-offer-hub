function hubPacingDetailsMarkup() {
    return '<details class="muted"><summary aria-label="Automatic request speed details">Automatic request speed</summary><p id="hub-pacing-details"></p></details>';
}
function renderHubPacingDetails(root, state) {
    const detail = root?.getElementById('hub-pacing-details');
    if (!detail || !state.pacing) return;
    const profile = state.pacing;
    const lastLimit = profile.lastRateLimitAt ? ` Last limited: ${new Date(profile.lastRateLimitAt).toLocaleString()}.` : '';
    detail.textContent = `${(profile.currentGapMs / 1000).toFixed(2)}s after each response · ${profile.successCount} successful samples in this window. Learns separately for this bank.${lastLimit}`;
}
