function hubRetryAfterMilliseconds(value, fallback, now = Date.now(), minimum = 0) {
    const numeric = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim());
    const delay = numeric ? Number(value) * 1000 : typeof value === 'string' ? Date.parse(value) - now : NaN;
    return Number.isFinite(delay) ? Math.max(minimum, 0, delay) : fallback;
}

// An instance belongs to one issuer. The shared definition has no startup effects.
function createHubRequestScheduler({ state, gapMilliseconds, ensureRunning, checkStorage = () => {},
    persist = () => {}, reservationMilliseconds = 0, onWait = () => {},
    cooldownError = () => new Error('Rate limited. Wait for the cooldown, then scan again.') }) {
    async function waitForRequestSlot() {
        ensureRunning();
        checkStorage();
        if (Date.now() < state.cooldownUntil) throw cooldownError();
        while (Date.now() < state.nextRequestAt) {
            ensureRunning();
            const remaining = state.nextRequestAt - Date.now();
            onWait(remaining);
            await new Promise(resolve => setTimeout(resolve, Math.min(250, remaining)));
        }
        ensureRunning();
        checkStorage();
        if (Date.now() < state.cooldownUntil) throw cooldownError();
    }
    async function withRequestSlot(operation) {
        if (state.requestInFlight) throw new Error('Another request is still active.');
        state.requestInFlight = true;
        let reserved = false;
        try {
            await waitForRequestSlot();
            if (reservationMilliseconds) {
                state.nextRequestAt = Date.now() + reservationMilliseconds + gapMilliseconds;
                persist();
                checkStorage();
            }
            reserved = true;
            return await operation();
        } finally {
            try {
                if (reserved) {
                    state.nextRequestAt = Date.now() + gapMilliseconds;
                    persist();
                    checkStorage();
                }
            } finally {
                state.requestInFlight = false;
            }
        }
    }
    return { waitForRequestSlot, withRequestSlot };
}
