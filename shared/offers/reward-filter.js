// The small-offer filter and the other list options of one bank's panel.
// minTotal / minRate: the list hides offers below them and every Add action skips
// them (banks pass hubRewardPassesFilter to createHubWorkflow as keepInPlan).
// An offer whose value the bank does not list is kept unless keepUnlisted is off,
// so nothing disappears silently because a bank left a number out.
// sort and show only change the list, never what Add takes.
const HUB_OFFER_VIEW_SORTS = ['value', 'rate', 'bank'];
const HUB_OFFER_VIEW_TABS = ['available', 'added', 'all'];
function hubNormalizeOfferView(value) {
    const read = number => typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : 0;
    return {
        minRate: Math.min(read(value?.minRate), 100), minTotal: read(value?.minTotal),
        keepUnlisted: value?.keepUnlisted !== false,
        sort: HUB_OFFER_VIEW_SORTS.includes(value?.sort) ? value.sort : 'value',
        show: HUB_OFFER_VIEW_TABS.includes(value?.show) ? value.show : 'available'
    };
}
function hubOfferViewHasMinimum(view) {
    return view.minRate > 0 || view.minTotal > 0;
}
// 'shown', 'kept-unlisted', 'hidden-small' or 'hidden-unlisted'.
function hubRewardFilterVerdict(reward, view) {
    view = hubNormalizeOfferView(view);
    const checks = [];
    if (view.minRate > 0) checks.push([hubRewardRate(reward), view.minRate]);
    if (view.minTotal > 0) checks.push([hubRewardTotal(reward), view.minTotal]);
    if (checks.some(([value, minimum]) => value !== null && value < minimum)) return 'hidden-small';
    if (checks.some(([value]) => value === null)) return view.keepUnlisted ? 'kept-unlisted' : 'hidden-unlisted';
    return 'shown';
}
// A missing view (panel not mounted yet) hides nothing.
function hubRewardPassesFilter(reward, view) {
    return !hubRewardFilterVerdict(reward, view).startsWith('hidden');
}
