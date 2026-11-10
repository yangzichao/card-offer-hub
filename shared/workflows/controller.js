// keepInPlan narrows what the Add actions take (the small-offer filter); it never
// widens the template's plan. A started task is checked against the unnarrowed
// plan, so changing the filter mid-run does not stop it, like search.
function createHubWorkflow({ type, capabilities, readRecords, readContext, keepInPlan = () => true }) {
    const template = HUB_WORKFLOW_TEMPLATES[type];
    if (!template || capabilities?.scope !== template.scope || typeof capabilities.activation !== 'boolean') {
        throw new Error('Workflow and bank capabilities do not match.');
    }
    function planEveryOffer() {
        const records = readRecords();
        if (!Array.isArray(records)) throw new Error('Workflow requires an offer list.');
        records.forEach(template.validateRecord);
        return template.plan(records, readContext());
    }
    function requireActivation() {
        if (!capabilities.activation) throw new Error('Adding is unavailable for this bank.');
    }
    function preview() {
        return planEveryOffer().filter(record => keepInPlan(record));
    }
    function plan() {
        requireActivation();
        return preview();
    }
    return Object.freeze({
        type, view: template.view, preview, plan,
        // The template's plan before keepInPlan, for list labels and counts only.
        previewBeforeFilter: planEveryOffer,
        skippedCount: () => planEveryOffer().length - preview().length,
        assertAction(source) {
            requireActivation();
            if (!planEveryOffer().some(record => record.source === source)) {
                throw new Error('The offer or its target changed. Refresh offers before adding.');
            }
        }
    });
}
