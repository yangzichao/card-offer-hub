const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { resolve, join, relative, posix, sep } = require('node:path');
const { resolveWorkflow } = require('./workflow-registry.cjs');

const projectRoot = resolve(__dirname, '../..');
const issuersDirectory = resolve(projectRoot, 'issuers');
const sharedDirectory = resolve(projectRoot, 'shared');
const manifestFileName = 'userscript.json';

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function listJavaScriptFilesRecursively(directory, rootDirectory = directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((entry) => {
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) return listJavaScriptFilesRecursively(absolutePath, rootDirectory);
            if (!entry.name.endsWith('.js')) return [];
            return [relative(rootDirectory, absolutePath).split(sep).join(posix.sep)];
        });
}

function findManifestDirectories(directory) {
    if (!existsSync(directory)) return [];
    if (existsSync(join(directory, manifestFileName))) return [directory];
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((entry) => findManifestDirectories(join(directory, entry.name)));
}

function requireString(manifestPath, manifest, field) {
    const value = manifest[field];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${manifestPath}: "${field}" must be a non-empty string.`);
    }
    return value;
}

function requireStringArray(manifestPath, manifest, field, { allowEmpty = false } = {}) {
    const value = manifest[field] ?? [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
        throw new Error(`${manifestPath}: "${field}" must be an array of non-empty strings.`);
    }
    if (!allowEmpty && value.length === 0) {
        throw new Error(`${manifestPath}: "${field}" must list at least one entry.`);
    }
    return value;
}

// Every .js file under src/ has to be listed exactly once in "sources". Bundling
// is ordered concatenation, so a new module that nobody registered would silently
// never ship; this turns that into a build failure instead.
function validateSourceCoverage(manifestPath, toolDirectory, declaredSources) {
    const sourceDirectory = join(toolDirectory, 'src');
    if (!existsSync(sourceDirectory)) throw new Error(`${manifestPath}: expected a src/ directory next to the manifest.`);
    const filesOnDisk = listJavaScriptFilesRecursively(sourceDirectory);
    const declared = new Set();
    for (const declaredSource of declaredSources) {
        if (declared.has(declaredSource)) throw new Error(`${manifestPath}: "sources" lists ${declaredSource} more than once.`);
        declared.add(declaredSource);
        if (!existsSync(join(sourceDirectory, declaredSource))) {
            throw new Error(`${manifestPath}: "sources" lists src/${declaredSource}, which does not exist.`);
        }
    }
    const unregistered = filesOnDisk.filter((file) => !declared.has(file));
    if (unregistered.length) {
        throw new Error(`${manifestPath}: src/${unregistered.join(', src/')} exist but are missing from "sources". `
            + 'Add them in the order they should be concatenated.');
    }
}

function validateSharedModules(manifestPath, sharedModules) {
    if (new Set(sharedModules).size !== sharedModules.length) throw new Error(`${manifestPath}: duplicate shared module.`);
    for (const sharedModule of sharedModules) {
        if (!existsSync(join(sharedDirectory, sharedModule))) {
            throw new Error(`${manifestPath}: "sharedModules" lists shared/${sharedModule}, which does not exist.`);
        }
    }
}

function readScriptManifest(toolDirectory) {
    const manifestPath = relative(projectRoot, join(toolDirectory, manifestFileName));
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(join(toolDirectory, manifestFileName), 'utf8'));
    } catch (error) {
        throw new Error(`${manifestPath}: could not be parsed as JSON. ${error.message}`);
    }
    const identifier = requireString(manifestPath, manifest, 'id');
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new Error(`${manifestPath}: "id" must be lowercase kebab-case; it identifies the bank module and its storage.`);
    }
    if (Object.hasOwn(manifest, 'version')) throw new Error(`${manifestPath}: bank modules must not declare a version. Use bundles/all/userscript.json.`);
    const sources = requireStringArray(manifestPath, manifest, 'sources');
    const sharedModules = requireStringArray(manifestPath, manifest, 'sharedModules', { allowEmpty: true });
    validateSourceCoverage(manifestPath, toolDirectory, sources);
    validateSharedModules(manifestPath, sharedModules);
    const savedResultsSource = manifest.savedResultsSource || null;
    if (savedResultsSource && !sources.includes(savedResultsSource)) {
        throw new Error(`${manifestPath}: savedResultsSource must be listed in sources.`);
    }
    const capabilities = manifest.capabilities || null;
    if (capabilities && (typeof capabilities.activation !== 'boolean' || !['card', 'account'].includes(capabilities.scope))) {
        throw new Error(`${manifestPath}: capabilities must declare activation and card/account scope.`);
    }
    const workflowModules = resolveWorkflow(manifestPath, manifest);
    const resolvedSharedModules = [...new Set([...sharedModules, ...workflowModules])];
    validateSharedModules(manifestPath, resolvedSharedModules);
    return {
        id: identifier,
        name: requireString(manifestPath, manifest, 'name'),
        description: requireString(manifestPath, manifest, 'description'),
        author: requireString(manifestPath, manifest, 'author'),
        issuer: requireString(manifestPath, manifest, 'issuer'),
        bankLabel: manifest.bankLabel || manifest.name,
        offersUrl: manifest.offersUrl || null,
        matches: requireStringArray(manifestPath, manifest, 'matches'),
        grants: requireStringArray(manifestPath, manifest, 'grants', { allowEmpty: true }),
        connects: requireStringArray(manifestPath, manifest, 'connects', { allowEmpty: true }),
        runAt: manifest.runAt ?? 'document-idle',
        noFrames: manifest.noFrames !== false,
        sharedModules: resolvedSharedModules,
        workflow: manifest.workflow,
        savedResultsSource,
        capabilities,
        sources,
        manifestPath,
        toolDirectory,
        toolDirectoryPath: relative(projectRoot, toolDirectory).split(sep).join(posix.sep)
    };
}

function loadScriptRegistry() {
    const scripts = findManifestDirectories(issuersDirectory).map(readScriptManifest);
    if (!scripts.length) throw new Error('No userscript.json manifests were found under issuers/.');
    const seenIdentifiers = new Map();
    for (const script of scripts) {
        const duplicate = seenIdentifiers.get(script.id);
        if (duplicate) throw new Error(`Duplicate script id "${script.id}" in ${duplicate} and ${script.manifestPath}.`);
        seenIdentifiers.set(script.id, script.manifestPath);
    }
    return scripts.sort((left, right) => left.id.localeCompare(right.id));
}

module.exports = {
    projectRoot,
    sharedDirectory,
    manifestFileName,
    loadScriptRegistry,
    readScriptManifest,
    validateSourceCoverage,
    listJavaScriptFilesRecursively
};
