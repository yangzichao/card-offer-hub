// The existing v3.4 userscript and the 2026-09-10 HAR both use this contract.
// Keep full-list reads on Offers Hub; changing the list API need not change writes.
const CARD_ENROLLMENT_ENDPOINT = 'CreateCardAccountOfferEnrollment.v1';

function enrollmentUserOffset(date) {
    const offsetMinutes = -date.getTimezoneOffset();
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    return `${offsetMinutes >= 0 ? '+' : '-'}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function cardEnrollmentBody(accountToken, offerIdentifier, requestDate = new Date()) {
    return {
        accountNumberProxy: accountToken,
        identifier: offerIdentifier,
        locale: 'en-US',
        requestDateTimeWithOffset: requestDate.toISOString(),
        userOffset: enrollmentUserOffset(requestDate)
    };
}

// Amex's explicit answer "Card member Already added the offer on another card"
// (2026-09-10 HARs). Not a success on this card, but no other card needs the offer.
const OFFER_ON_OTHER_CARD_CODE = 'PZN4107';

function cardEnrollmentStatus(response, accountToken, offerIdentifier) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return 'UNCONFIRMED';
    if (response.accountNumberProxy && response.accountNumberProxy !== accountToken) return 'UNCONFIRMED';
    if (response.identifier && response.identifier !== offerIdentifier) return 'UNCONFIRMED';
    if (response.isEnrolled === false && response.explanationCode === OFFER_ON_OTHER_CARD_CODE) return 'ON_OTHER_CARD';
    if (response.status?.purpose === 'FAILURE' || response.status?.purpose === 'ERROR' || response.isEnrolled === false) return 'FAILED';
    // The original `isEnrolled || true` falsely reported false/missing values as
    // success. Only the literal boolean observed in the successful HAR is valid.
    return response.isEnrolled === true ? 'ENROLLED' : 'UNCONFIRMED';
}

function cardEnrollmentEvidence(response) {
    if (response?.isEnrolled === true) return 'isEnrolled=true';
    if (response?.isEnrolled === false) {
        // Only a short code is logged, never free text from the server.
        const code = response.explanationCode;
        return `isEnrolled=false${typeof code === 'string' && /^[A-Z0-9_-]{1,20}$/.test(code) ? `, ${code}` : ''}`;
    }
    return `isEnrolled ${response?.isEnrolled === undefined ? 'missing' : 'has an invalid type'}`;
}
