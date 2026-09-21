// Existing keys and schema remain readable after the runtime refactor.
const issuerStorage = { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) };
const { restorePacing, savePacing, pacing } = createHubPacingStorage({
    state, policy: { minimumGapMs: SETTINGS.gapMilliseconds, defaultCooldownMs: SETTINGS.defaultCooldownMilliseconds,
        maximumSampleDurationMs: SETTINGS.timeoutMilliseconds }, storage: issuerStorage, storageKey: `${SETTINGS.id}:pacing`, onError: () => renderPanel()
});
