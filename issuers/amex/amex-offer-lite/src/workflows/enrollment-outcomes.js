// Tallies one Add run by the status each HTTP 200 answer produced. Only ENROLLED
// counts as added; the others are reported separately, never as a success.
function createEnrollmentTally() {
    return { ENROLLED: 0, ON_OTHER_CARD: 0, FAILED: 0, UNCONFIRMED: 0 };
}

function enrollmentTallySummary(tally) {
    return [
        `${tally.ENROLLED} offers added`,
        tally.ON_OTHER_CARD ? `${tally.ON_OTHER_CARD} already on another card` : '',
        tally.FAILED ? `${tally.FAILED} declined by Amex` : '',
        tally.UNCONFIRMED ? `${tally.UNCONFIRMED} unconfirmed; scan to check them` : ''
    ].filter(Boolean).join(' · ') + '.';
}
