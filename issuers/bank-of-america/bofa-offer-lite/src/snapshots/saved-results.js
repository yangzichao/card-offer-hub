function readIssuerSavedResults(bank, readValue) {
    const snapshot = readValue(`${__USERSCRIPT_ID__}:workspace`, null);
    if (snapshot === null) return null;
    return hubWorkspaceDisplayRecords(bank, snapshot, offer => ({
        merchant: offer.name, description: offer.headline,
        displayStatus: offer.result === 'Unconfirmed' ? 'review' : offer.activated === true ? 'added' : offer.eligible === true ? 'available' : 'other'
    }), __USERSCRIPT_WORKFLOW__);
}
