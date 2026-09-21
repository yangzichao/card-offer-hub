function createHubAccountTemplate() {
    return Object.freeze({ scope: 'account', view: hubAccountView(),
        validateRecord: record => hubValidateWorkflowRecord(record, ['accountId']), plan: hubPlanAccountOffers });
}
