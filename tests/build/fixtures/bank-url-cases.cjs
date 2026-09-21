// Independent acceptance cases: never derive expected coverage from manifests.
const bankUrlCases = [
    { id: 'amex-offer-lite', urls: {
        entry: ['https://americanexpress.com/', 'https://www.americanexpress.com/en-us/account/login', 'https://account.americanexpress.com/'],
        adapter: ['https://global.americanexpress.com/', 'https://global.americanexpress.com/offers?locale=en-US#available']
    } },
    { id: 'citi-offer-lite', urls: {
        entry: ['https://citi.com/', 'https://www.citi.com/?loginScreenId=preLoginInactivity', 'https://account.citi.com/'],
        adapter: ['https://online.citi.com/', 'https://online.citi.com/US/ag/merchantoffers', 'https://online.citi.com/US/nga/products-offers/merchantoffers?source=menu#offers']
    } },
    { id: 'chase-offer-lite', urls: {
        entry: ['https://chase.com/', 'https://www.chase.com/', 'https://account.chase.com/'],
        adapter: ['https://secure.chase.com/', 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub', 'https://secure.chase.com/web/authentication/login']
    } },
    { id: 'bofa-offer-lite', urls: {
        entry: ['https://bankofamerica.com/', 'https://www.bankofamerica.com/', 'https://secure.bankofamerica.com/myaccounts/'],
        adapter: ['https://deals.merchant-rewards.com/', 'https://deals.merchant-rewards.com/?token=synthetic#offers']
    } },
    { id: 'usbank-offer-lite', urls: {
        entry: ['https://usbank.com/', 'https://www.usbank.com/online-mobile-banking/activate-your-cash-back-deals.html', 'https://www2.usbank.com/'],
        adapter: ['https://onlinebanking.usbank.com/', 'https://onlinebanking.usbank.com/dominjection/cashback-deals', 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals?source=menu']
    } },
    { id: 'wellsfargo-offer-lite', urls: {
        entry: ['https://wellsfargo.com/', 'https://www.wellsfargo.com/', 'https://connect.secure.wellsfargo.com/'],
        adapter: ['https://web.secure.wellsfargo.com/', 'https://web.secure.wellsfargo.com/auth/login', 'https://web.secure.wellsfargo.com/auth/deals-portal?source=menu', 'https://web.secure.wellsfargo.com/deals-portal/']
    } }
];

module.exports = { bankUrlCases };
