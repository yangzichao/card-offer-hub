function createHubWorkflow({ type, capabilities, readRecords, readContext }) {
    const template = HUB_WORKFLOW_TEMPLATES[type];
    if (!template || capabilities?.scope !== template.scope || typeof capabilities.activation !== 'boolean') {
        throw new Error('Workflow and bank capabilities do not match.');
    }
    function preview() {
        const records = readRecords();
        if (!Array.isArray(records)) throw new Error('Workflow requires an offer list.');
        records.forEach(template.validateRecord);
        return template.plan(records, readContext());
    }
    function plan() {
        if (!capabilities.activation) throw new Error('Adding is unavailable for this bank.');
        return preview();
    }
    return Object.freeze({
        type, view: template.view, preview, plan,
        assertAction(source) {
            if (!plan().some(record => record.source === source)) {
                throw new Error('The offer or its target changed. Refresh offers before adding.');
            }
        }
    });
}
