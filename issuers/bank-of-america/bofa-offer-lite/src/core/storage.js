// Existing keys and schema remain readable after the runtime refactor.
const issuerStorage = { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) };
const { restorePacing, savePacing } = createHubPacingStorage({
    state, storage: issuerStorage, storageKey: `${SETTINGS.id}:pacing`, onError: () => renderPanel()
});
