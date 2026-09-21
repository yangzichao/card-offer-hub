function persistOfferResults() {
    if (state.savedOffersRestoreBlocked) return false;
    try {
        const cards = [...state.offersByAccount].map(([accountToken, offers]) => ({
            accountToken,
            complete: state.scanReports.get(accountToken)?.startsWith('Complete') || false,
            scannedAt: state.offerScanTimes.get(accountToken) || 0,
            offers: offers.map((offer) => {
                const snapshot = offerSnapshotValue(offer);
                // A reload cannot tell whether an in-flight enrollment succeeded.
                // Persist uncertainty before sending, never a retryable stale state.
                if (state.pendingEnrollments.has(enrollmentStorageKey(accountToken, offer.groupKey))) snapshot.status = 'UNCONFIRMED';
                return snapshot;
            })
        }));
        GM_setValue(SETTINGS.savedOffersKey, { schemaVersion: 2, workflowType: SETTINGS.workflow, cards });
        state.savedOffersError = '';
        return true;
    } catch {
        state.savedOffersError = 'Could not save offers. These changes apply to this page only; check Tampermonkey storage.';
        log(state.savedOffersError);
        return false;
    }
}

function restoreSavedOffers() {
    try {
        const snapshot = GM_getValue(SETTINGS.savedOffersKey, null);
        if (snapshot === null) return;
        const cards = validateOfferSnapshot(snapshot);
        for (const card of cards) {
            state.offersByAccount.set(card.accountToken, card.offers);
            state.scanReports.set(card.accountToken, card.complete ? 'Complete' : 'Incomplete');
            state.offerScanTimes.set(card.accountToken, card.scannedAt);
        }
        if (cards.length) {
            state.status = 'Saved offers restored. Review them now or refresh whitelist offers manually.';
            log('Saved offer results restored without sending requests.');
        }
    } catch {
        state.savedOffersRestoreBlocked = true;
        state.savedOffersError = 'Could not restore saved offers. Saved data was not overwritten.';
        log(state.savedOffersError);
    }
}
