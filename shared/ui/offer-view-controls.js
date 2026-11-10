// List options under the offer search: To add / Added / All, the small-offer
// minimums, sort, and whether offers with no listed value stay.
const HUB_MIN_TOTAL_CHOICES = [5, 10, 20, 50, 100];
const HUB_MIN_RATE_CHOICES = [3, 5, 10, 15, 20];
const HUB_OFFER_VIEW_TAB_NAMES = { available: 'Show offers to add', added: 'Show added offers', all: 'Show all offers' };
function hubOfferViewMarkup() {
    const tab = (value, label) => `<label class="hub-view-tab"><input type="radio" name="hub-view-show" value="${value}" aria-label="${HUB_OFFER_VIEW_TAB_NAMES[value]}">`
        + `<span>${label}</span><span class="hub-view-count" data-count="${value}">0</span></label>`;
    return `<div class="hub-view">
        <div class="hub-view-tabs" role="radiogroup" aria-label="Show offers">${tab('available', 'To add')}${tab('added', 'Added')}${tab('all', 'All')}</div>
        <div class="hub-view-options">
          <select id="hub-min-total" aria-label="Minimum total cash back"></select>
          <select id="hub-min-rate" aria-label="Minimum percent back"></select>
          <select id="hub-sort" aria-label="Sort offers"><option value="value">Best value first</option><option value="rate">Highest rate first</option><option value="bank">Bank order</option></select>
        </div>
        <label class="hub-view-keep" hidden><input id="hub-keep-unlisted" type="checkbox" aria-label="Keep offers with no listed value">Keep offers with no listed value</label>
        <p id="hub-view-summary" class="muted hub-view-summary" aria-live="polite" hidden></p>
      </div>`;
}
function hubFillMinimumSelect(select, choices, current, format, anyLabel) {
    const values = [...new Set([0, ...choices, current])].sort((left, right) => left - right);
    select.replaceChildren(...values.map(value => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = value ? format(value) : anyLabel;
        return option;
    }));
    select.value = String(current);
}
function hubBindOfferView(root, { state, store, render }) {
    const loaded = store.load();
    state.offerView = loaded.view;
    state.offerViewError = loaded.error;
    const total = root.getElementById('hub-min-total');
    const rate = root.getElementById('hub-min-rate');
    const sort = root.getElementById('hub-sort');
    const keep = root.getElementById('hub-keep-unlisted');
    const tabs = [...root.querySelectorAll('input[name="hub-view-show"]')];
    const showView = view => {
        hubFillMinimumSelect(total, HUB_MIN_TOTAL_CHOICES, view.minTotal, value => `Total ${hubFormatRewardDollars(value)}+`, 'Any total');
        hubFillMinimumSelect(rate, HUB_MIN_RATE_CHOICES, view.minRate, value => `Rate ${hubFormatRewardPercent(value)}+`, 'Any rate');
        sort.value = view.sort;
        keep.checked = view.keepUnlisted;
        keep.closest('label').hidden = !hubOfferViewHasMinimum(view);
        for (const tab of tabs) tab.checked = tab.value === view.show;
    };
    showView(state.offerView);
    const update = () => {
        state.offerView = hubNormalizeOfferView({ minTotal: Number(total.value), minRate: Number(rate.value), sort: sort.value,
            keepUnlisted: keep.checked, show: tabs.find(tab => tab.checked)?.value });
        state.offerViewError = store.save(state.offerView);
        showView(state.offerView);
        render();
    };
    for (const control of [total, rate, sort, keep, ...tabs]) control.addEventListener('change', update);
}
