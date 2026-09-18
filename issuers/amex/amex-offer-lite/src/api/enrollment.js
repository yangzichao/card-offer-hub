function enrollOffer(accountToken, offerId) {
    return withRequestSlot(() => sendEnrollmentRequest(accountToken, offerId));
}

async function sendEnrollmentRequest(accountToken, offerId) {
    const response = await sendJsonRequest(`${SETTINGS.functionsBase}/${CARD_ENROLLMENT_ENDPOINT}`, {
        accountToken,
        body: cardEnrollmentBody(accountToken, offerId)
    });
    const status = cardEnrollmentStatus(response, accountToken, offerId);
    const cardName = state.accounts.find((account) => account.token === accountToken)?.cardName || 'Selected card';
    log(`${cardName}: ${status} (${cardEnrollmentEvidence(response)}).`);
    return status;
}
