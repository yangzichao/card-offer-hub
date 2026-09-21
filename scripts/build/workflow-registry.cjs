const catalog = require('../../shared/workflows/catalog.json');

const commonModules = ['workflows/contract.js', 'workflows/controller.js', 'workflows/snapshot.js'];

function resolveWorkflow(manifestPath, manifest) {
    const template = Object.hasOwn(catalog, manifest.workflow) ? catalog[manifest.workflow] : null;
    if (!template) throw new Error(`${manifestPath}: workflow must name a registered template.`);
    if (!manifest.capabilities || manifest.capabilities.scope !== template.scope) {
        throw new Error(`${manifestPath}: workflow ${manifest.workflow} requires ${template.scope} scope.`);
    }
    return [...commonModules, ...template.modules];
}

function bundleWorkflowRegistry(scripts) {
    const types = [...new Set(scripts.map(script => script.workflow))];
    const entries = types.map(type => {
        const factory = catalog[type]?.factory;
        if (!/^[A-Za-z_$][\w$]*$/.test(factory)) throw new Error(`Invalid workflow factory: ${type}`);
        return `${JSON.stringify(type)}: ${factory}()`;
    });
    return `const HUB_WORKFLOW_TEMPLATES = Object.freeze({ ${entries.join(', ')} });`;
}

module.exports = { resolveWorkflow, bundleWorkflowRegistry };
