const { restorePacing, savePacing, pacing } = createHubPacingStorage({
    state, version: SETTINGS.version, storageKey: `${__USERSCRIPT_ID__}:pacing`,
    storage: { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) },
    policy: { minimumGapMs: SETTINGS.requestGapMs, defaultCooldownMs: SETTINGS.rateLimitCooldownMs,
        maximumSampleDurationMs: SETTINGS.requestTimeoutMs },
    readLegacyCooldown: () => Number(localStorage.getItem(SETTINGS.cooldownKey))
});
function restoreLocalSettings() {
    restoreSavedCards();
    restoreSavedOffers();
    restoreViewSettings();
    restorePacing();
}
