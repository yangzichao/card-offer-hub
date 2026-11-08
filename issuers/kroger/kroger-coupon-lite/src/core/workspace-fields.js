// Display fields only. krogerCouponNumber is the clip confirmation key and
// stays in memory; a clip always starts from a fresh list read.
const WORKSPACE_FIELDS = {
    "accounts": null,
    "offers": {
        "offerId": "id",
        "merchant": "text",
        "title": "text",
        "category": "text",
        "expires": "text",
        "status": "text"
    }
};
