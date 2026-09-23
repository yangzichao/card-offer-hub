// Amex's functions gateway answers its rate limit with HTTP 429 but no CORS headers.
// The browser hides that status, so fetch only rejects with "Failed to fetch".
// The 2025-11 capture shows it: 26 enrollments answered within 31 s, then a 429 for
// every request. A network error from this gateway is handled like a 429 without
// Retry-After: slow down, cool down, end the run. The request itself stays
// unconfirmed, because the page cannot tell it apart from a real connection drop.
const SUSPECTED_RATE_LIMIT_MESSAGE = 'Amex stopped answering ("Failed to fetch"), most likely its rate limit. '
    + 'Paused for the cooldown; later requests will be slower. No automatic retry was made.';

async function fetchTreatingNetworkErrorAsRateLimit(url, options, observe) {
    try {
        return await fetch(url, options);
    } catch (error) {
        // Timeouts (AbortError) and same-origin requests keep their normal handling.
        if (error?.name !== 'TypeError' || !url.startsWith(`${SETTINGS.functionsBase}/`)) throw error;
        observe('limited');
        pacing.rateLimited(null, { httpStatus: null });
        if (!savePacing()) throw new Error(state.storageError);
        throw new Error(SUSPECTED_RATE_LIMIT_MESSAGE);
    }
}
