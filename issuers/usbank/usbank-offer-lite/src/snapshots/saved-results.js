function readIssuerSavedResults(bank, readValue) {
    const snapshot = readValue(`${__USERSCRIPT_ID__}:workspace`, null);
    if (snapshot === null) return null;
    return hubWorkspaceDisplayRecords(bank, snapshot, offer => ({
        merchant: offer.merchant, description: offer.title, displayStatus: hubStatus(offer.status),
        expires: offer.expires, category: offer.category
    }), __USERSCRIPT_CAPABILITIES__.scope === 'card');
}
