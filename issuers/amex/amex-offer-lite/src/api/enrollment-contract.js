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

function cardEnrollmentStatus(response, accountToken, offerIdentifier) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return 'UNCONFIRMED';
    if (response.accountNumberProxy && response.accountNumberProxy !== accountToken) return 'UNCONFIRMED';
    if (response.identifier && response.identifier !== offerIdentifier) return 'UNCONFIRMED';
    if (response.status?.purpose === 'FAILURE' || response.status?.purpose === 'ERROR' || response.isEnrolled === false) return 'FAILED';
    // The original `isEnrolled || true` falsely reported false/missing values as
    // success. Only the literal boolean observed in the successful HAR is valid.
    return response.isEnrolled === true ? 'ENROLLED' : 'UNCONFIRMED';
}

function cardEnrollmentEvidence(response) {
    if (response?.isEnrolled === true) return 'isEnrolled=true';
    if (response?.isEnrolled === false) return 'isEnrolled=false';
    return `isEnrolled ${response?.isEnrolled === undefined ? 'missing' : 'has an invalid type'}`;
}
