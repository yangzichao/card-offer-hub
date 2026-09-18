function restoreLocalSettings() {
    restoreSavedCards();
    restoreSavedOffers();
    try {
        const cooldownUntil = Number(localStorage.getItem(SETTINGS.cooldownKey));
        if (Number.isFinite(cooldownUntil)) state.cooldownUntil = cooldownUntil;
    } catch {
        log('Saved cooldown could not be read.');
    }
}

function persistCooldown() {
    try {
        localStorage.setItem(SETTINGS.cooldownKey, String(state.cooldownUntil));
    } catch {
        log('Cooldown is active for this page; browser storage is unavailable.');
    }
}
