function createHubPerCardTemplate() {
    return Object.freeze({ scope: 'card', view: hubPerCardView(),
        validateRecord: record => hubValidateWorkflowRecord(record, ['cardId']), plan: hubPlanPerCardOffers });
}
