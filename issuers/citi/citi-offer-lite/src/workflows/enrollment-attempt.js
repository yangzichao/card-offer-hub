async function attemptCitiEnrollment(offer) {
    offerWorkflow.assertAction(offer);
    markWorkspaceOfferPending(offer);
    let serverErrorStatus = null;
    let payload;
    try {
        payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
    } catch (error) {
        // Only a completed HTTP server-error response can be isolated here.
        // Auth, rate limits, network errors, Stop and persistence failures still propagate.
        if (error.name !== 'HubHttpError' || !Number.isInteger(error.httpStatus) || error.httpStatus < 500 || error.httpStatus > 599) throw error;
        serverErrorStatus = error.httpStatus;
    }
    const confirmed = serverErrorStatus === null && enrollmentConfirmed(payload, offer);
    offer.status = confirmed ? 'ENROLLED' : 'UNCONFIRMED';
    // Checkpoint every unknown result before sending another offer. Never replay it.
    finishWorkspaceOffer(offer);
    return { confirmed, serverErrorStatus };
}
