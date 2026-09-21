function createHubAmexCombinationTemplate() {
    return Object.freeze({ scope: 'card', view: hubAmexCombinationView(),
        validateRecord: record => hubValidateWorkflowRecord(record, ['cardId', 'groupId']), plan: hubPlanCombinedOffers });
}
