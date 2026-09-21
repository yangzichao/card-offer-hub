function enrollOffer(accountToken, offerId) {
    return withRequestSlot(observe => sendEnrollmentRequest(accountToken, offerId, observe));
}

async function sendEnrollmentRequest(accountToken, offerId, observe) {
    const response = await sendJsonRequest(`${SETTINGS.functionsBase}/${CARD_ENROLLMENT_ENDPOINT}`, {
        accountToken,
        body: cardEnrollmentBody(accountToken, offerId), observe,
        validateResponse: payload => cardEnrollmentStatus(payload, accountToken, offerId) === 'ENROLLED'
    });
    const status = cardEnrollmentStatus(response, accountToken, offerId);
    const cardName = state.accounts.find((account) => account.token === accountToken)?.cardName || 'Selected card';
    log(`${cardName}: ${status} (${cardEnrollmentEvidence(response)}).`);
    return status;
}
