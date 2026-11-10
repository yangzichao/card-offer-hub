const test = require('node:test');
const assert = require('node:assert/strict');
const chase = require('../chase/helpers/userscript-harness.cjs');
const { listing: chaseListing, offer: chaseOffer } = require('../chase/fixtures/offers-response.cjs');
const usbank = require('../usbank/helpers/userscript-harness.cjs');
const wells = require('../wellsfargo/helpers/userscript-harness.cjs');
const citi = require('../citi/helpers/userscript-harness.cjs');
const bofa = require('../bank-of-america/helpers/userscript-harness.cjs');
const { createUserscriptHarness } = require('../amex/helpers/userscript-harness.cjs');

// Field shapes and value patterns follow local captures (2026-09); merchants and IDs are synthetic.
const plain = value => JSON.parse(JSON.stringify(value));
const reward = (kind, amount, maxReward = null, minSpend = null) => ({ kind, amount, maxReward, minSpend });

test('Chase reads its single offer option; 0 means no cap or minimum', () => {
    const harness = chase.createHarness();
    const raw = (option, extra = {}) => ({ ...chaseOffer(`synthetic-${Math.random()}`), offerDetails: { offerEndTimestamp: '2099-12-31', offerOptions: option, ...extra } });
    const offers = [
        raw([{ offerRewardTypeCode: 'PERCENTAGE', offerAmount: 10.0, maximumRewardOfferAmount: 9.0, minimumSpendingAmount: 0.0 }]),
        raw([{ offerRewardTypeCode: 'DOLLAR', offerAmount: 50.0, maximumRewardOfferAmount: 0.0, minimumSpendingAmount: 295.0 }]),
        raw([{ offerRewardTypeCode: 'PERCENTAGE', offerAmount: 15.0, maximumRewardOfferAmount: 0.0, minimumSpendingAmount: 0.0 }]),
        raw([{ offerRewardTypeCode: 'PERCENTAGE', offerAmount: 5 }, { offerRewardTypeCode: 'PERCENTAGE', offerAmount: 10 }]),
        raw([{ offerRewardTypeCode: 'POINTS', offerAmount: 500 }]),
        raw(undefined)
    ];
    const normalized = harness.normalizeOffers(chaseListing('101', offers), '101', '909');
    assert.deepEqual(Array.from(normalized, offer => plain(offer.reward)), [
        reward('percent', 10, 9), reward('fixed', 50, null, 295), reward('percent', 15), null, null, null
    ]);
});

test('US Bank reads ad.reward and ignores its 0.2 "any purchase" minimum', () => {
    const harness = usbank.createHarness(() => {});
    const ad = (id, values) => {
        const raw = usbank.offer(id);
        raw.ad.reward = { ...raw.ad.reward, ...values };
        return raw;
    };
    const { offers } = harness.normalizeListing(usbank.listing([
        ad('a', { rewardType: 'PERCENT_AMOUNT_PURCHASE', rewardAmount: 10, maxRewardAmount: 4, purchaseRequirement: { minSpendAmount: 0.2 } }),
        ad('b', { rewardType: 'FIXED_AMOUNT_PURCHASE', rewardAmount: 10, maxRewardAmount: 10, purchaseRequirement: { minSpendAmount: 100 } }),
        ad('c', { rewardType: 'PERCENT_AMOUNT_PURCHASE', rewardAmount: 5, maxRewardAmount: 100, isMultiRedemption: true }),
        ad('d', {})
    ]));
    assert.deepEqual(Array.from(offers, offer => plain(offer.reward)), [
        reward('percent', 10, 4), reward('fixed', 10, 10, 100), reward('percent', 5, 100), null
    ]);
});

test('Wells Fargo reads amountType and dealAmount, and the cap from its long description', () => {
    const harness = wells.createHarness();
    const offers = harness.normalizeOffers(wells.listing([
        wells.offer('1001', {}, { amountType: '%', dealAmount: '10', longDescription: 'Earn 10% cash back on your Example purchase, with a $7.00 cash back maximum.<br/><br/>About.' }),
        wells.offer('1002', {}, { amountType: '%', dealAmount: '15', longDescription: 'Earn 15% cash back on your first payment, <b>when you spend $9.99 or more.</b>' }),
        wells.offer('1003', {}, { amountType: '$', dealAmount: '20' }),
        wells.offer('1004', {}, { amountType: '%', dealAmount: 'ten' }),
        wells.offer('1005')
    ]));
    assert.deepEqual(Array.from(offers, offer => plain(offer.reward)), [
        reward('percent', 10, 7), reward('percent', 15, null, 9.99), reward('fixed', 20), null, null
    ]);
});

test('Citi reads "$30 Back" and "5% Back" titles and rejects a title that disagrees with its type', () => {
    const harness = citi.createHarness();
    const offers = harness.normalizeOffers(citi.listing([
        citi.offer('a', 'AVAILABLE', { offerTitle: '$30 Back', offerDiscountType: 'ABSOLUTE' }),
        citi.offer('b', 'AVAILABLE', { offerTitle: '4.75% Back', offerDiscountType: 'PERCENTAGE' }),
        citi.offer('c', 'AVAILABLE', { offerTitle: '10% Back' }),
        citi.offer('d', 'AVAILABLE', { offerTitle: '$5 Back', offerDiscountType: 'PERCENTAGE' }),
        citi.offer('e', 'AVAILABLE', { offerTitle: 'Earn more at Example' })
    ]), 'card-a');
    assert.deepEqual(Array.from(offers, offer => plain(offer.reward)), [
        reward('fixed', 30), reward('percent', 4.75), reward('percent', 10), null, null
    ]);
});

test('Deals reads reward_type with reward_value or reward_rate, not the headline', () => {
    const harness = bofa.createHarness(() => {});
    const cases = [
        [{ reward_type: 'FIXED', reward_value: 15.0, reward_rate: 0.0, headline: 'Earn $15 cash back when you spend $75 at Example!' }, reward('fixed', 15, null, 75)],
        [{ reward_type: 'PERCENTAGE', reward_value: 0.0, reward_rate: 9.0, headline: 'Shop and Earn Today' }, reward('percent', 9)],
        [{ reward_type: 'PERCENTAGE', reward_rate: 6, maximum_reward_per_transaction: 25, maximum_redemptions: 1, minimum_spend: 50 }, reward('percent', 6, 25, 50)],
        [{ reward_type: 'PERCENTAGE', reward_rate: 6, maximum_reward_per_transaction: 25, maximum_redemptions: null }, reward('percent', 6)],
        [{ reward_type: 'PERCENTAGE', reward_rate: 0.0 }, null],
        [{}, null]
    ];
    for (const [extra, expected] of cases) {
        assert.deepEqual(plain(harness.normalizeOffer(bofa.offer('101', extra)).reward), expected, JSON.stringify(extra));
    }
});

test('Amex reads three description phrasings and leaves points and other wording unknown', () => {
    const { amexOfferReward } = createUserscriptHarness();
    const cases = [
        ['Spend $100 or more, earn $20 back', reward('fixed', 20, null, 100)],
        ['Spend $100 or more on qualifying merch & concessions purchases, earn $10 back', reward('fixed', 10, null, 100)],
        ['Spend $10 or more, earn $2 back, up to 5 times (total of $10)', reward('fixed', 2, 10, 10)],
        ['Spend $50 or more, earn $10 back, up to 3 times', reward('fixed', 10, 30, 50)],
        ['Earn 10% back on qualifying concessions purchases, up to $250 per calendar year', reward('percent', 10, 250)],
        ['Earn 5% back on purchases, up to a total of $1,000', reward('percent', 5, 1000)],
        ['Earn 20% back on your purchase', reward('percent', 20)],
        ['Spend $1,000 or more, earn 10,000 Membership Rewards® points', null],
        ['Earn +4 Membership Rewards® points per eligible dollar spent', null],
        ['', null]
    ];
    for (const [description, expected] of cases) assert.deepEqual(plain(amexOfferReward(description)), expected, description);
});
