// One offer inside an unattended Add run. A problem with this one offer never
// ends the run: an unclear write is checked with a fresh read, re-sent once only
// when that read shows the offer still available and not added, and otherwise
// recorded so the run moves on to the next offer. Sign-in (401/403), rate
// limits (429), session changes, Stop and storage failures still end the run.
const HUB_OFFER_MAXIMUM_SENDS = 2;
const HUB_CONSECUTIVE_OFFER_FAILURE_PAUSE = 3;
const HUB_OFFER_FAILURE_OUTCOMES = ['not-added', 'unconfirmed', 'check-failed'];

// A completed HTTP error response that can concern only this offer.
function hubOfferScopedHttpError(error) {
    return error?.name === 'HubHttpError' && Number.isInteger(error.httpStatus)
        && error.httpStatus >= 400 && error.httpStatus <= 599 && ![401, 403, 429].includes(error.httpStatus);
}
// A write with an unknown result: this offer's HTTP error, or a dropped or
// timed-out request. The fresh read that follows decides what happened; if
// that read fails on the network too, the run stops.
function hubOfferScopedWriteError(error) {
    return hubOfferScopedHttpError(error) || error?.requestUnconfirmed === true;
}

// readStatus(): a fresh read of this offer → 'added' | 'available' | 'unavailable'.
// send(): one write; resolves true only when the response itself explicitly confirms it.
// Outcomes: added, already-added, unavailable (explicit answers before any
// write), not-added (verified still available), unconfirmed (sent, then no read
// showed it added or still available), check-failed (nothing sent).
async function hubAttemptOffer({ readStatus, send, initialStatus = null,
    isWriteFailure = hubOfferScopedWriteError, maximumSends = HUB_OFFER_MAXIMUM_SENDS }) {
    async function readOnce() {
        try { return await readStatus(); }
        catch (error) { if (!hubOfferScopedHttpError(error)) throw error; }
        // A read has no side effects; one more after the normal request gap.
        try { return await readStatus(); }
        catch (error) { if (!hubOfferScopedHttpError(error)) throw error; return 'unknown'; }
    }
    let status = initialStatus ?? await readOnce();
    let sends = 0;
    for (;;) {
        if (status === 'added') return { outcome: sends ? 'added' : 'already-added', sends };
        // Gone or ineligible right after a write is not an explicit answer to that write.
        if (status === 'unavailable') return { outcome: sends ? 'unconfirmed' : 'unavailable', sends };
        if (status === 'unknown') return { outcome: sends ? 'unconfirmed' : 'check-failed', sends };
        if (status !== 'available') throw new Error('Offer status was not recognized. Scan again.');
        if (sends >= maximumSends) return { outcome: 'not-added', sends };
        sends++;
        let confirmed = false;
        try { confirmed = (await send()) === true; }
        catch (error) { if (!isWriteFailure(error)) throw error; }
        if (confirmed) return { outcome: 'added', sends };
        status = await readOnce();
    }
}

// Counts for one run, the progress note, the pause rule and the final summary.
function createHubOfferRunTally(total) {
    const counts = { added: 0, 'already-added': 0, unavailable: 0, 'not-added': 0, unconfirmed: 0, 'check-failed': 0 };
    const failedNames = [];
    let processed = 0;
    let consecutiveFailures = 0;
    function failures() { return counts['not-added'] + counts.unconfirmed + counts['check-failed']; }
    function names() {
        const shown = failedNames.slice(0, 3).join(', ');
        return failedNames.length > 3 ? `${shown} and ${failedNames.length - 3} more` : shown;
    }
    return {
        counts,
        get processed() { return processed; },
        get added() { return counts.added; },
        // Returns true when the run should pause: several offers in a row failed,
        // which points at a problem with the bank rather than with one offer.
        record(outcome, name) {
            if (!(outcome in counts)) throw new Error('Unknown offer outcome.');
            counts[outcome]++;
            processed++;
            const failed = HUB_OFFER_FAILURE_OUTCOMES.includes(outcome);
            if (failed) failedNames.push(name || 'Offer');
            consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
            return consecutiveFailures >= HUB_CONSECUTIVE_OFFER_FAILURE_PAUSE && processed < total;
        },
        progressNote() {
            return failures() ? ` ${failures()} could not be added so far; continuing with the rest.` : '';
        },
        summary() {
            const parts = [`${counts.added} of ${total} added.`];
            if (counts['already-added']) parts.push(`${counts['already-added']} were already added.`);
            if (counts.unavailable) parts.push(`${counts.unavailable} no longer eligible.`);
            if (counts['not-added'] + counts['check-failed']) {
                parts.push(`${counts['not-added'] + counts['check-failed']} not added after a retry; Add tries them again.`);
            }
            if (counts.unconfirmed) parts.push(`${counts.unconfirmed} could not be verified; scan to check them.`);
            if (failures()) parts.push(`Not added: ${names()}.`);
            return parts.join(' ');
        },
        pauseMessage() {
            return `Paused: ${HUB_CONSECUTIVE_OFFER_FAILURE_PAUSE} offers in a row could not be added, so the bank may be having trouble. `
                + `${total - processed} not tried yet. Click Add again to continue. ${this.summary()}`;
        }
    };
}
