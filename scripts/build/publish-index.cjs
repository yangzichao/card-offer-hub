const { repositoryUrl, publishedFileUrl, publishedUserscriptFileName, REPOSITORY } = require('./repository.cjs');
const { loadAllInOneManifest } = require('./all-in-one-manifest.cjs');

// dist/index.json is the machine-readable catalog of everything published from
// this repository: one entry per script, with the exact address Tampermonkey
// installs and updates from. It carries no build timestamp, so rebuilding
// unchanged sources produces an identical file and "npm run check" stays honest.
function buildPublishIndex(scripts) {
    const combined = loadAllInOneManifest(scripts);
    const combinedFileName = publishedUserscriptFileName(combined.id);
    const index = {
        repository: repositoryUrl(),
        publishBranch: REPOSITORY.publishBranch,
        allInOne: {
            id: combined.id, name: combined.name, version: combined.version,
            publishedFile: `${REPOSITORY.publishDirectory}/${combinedFileName}`,
            installUrl: publishedFileUrl(combinedFileName), updateUrl: publishedFileUrl(combinedFileName),
            includes: scripts.map(script => ({ id: script.id, version: script.version }))
        },
        scripts: scripts.map((script) => {
            const installUrl = publishedFileUrl(publishedUserscriptFileName(script.id));
            return {
                id: script.id,
                name: script.name,
                version: script.version,
                description: script.description,
                issuer: script.issuer,
                matches: script.matches,
                publishedFile: `${REPOSITORY.publishDirectory}/${publishedUserscriptFileName(script.id)}`,
                installUrl,
                updateUrl: installUrl,
                sourceDirectory: script.toolDirectoryPath
            };
        })
    };
    return `${JSON.stringify(index, null, 4)}\n`;
}

module.exports = { buildPublishIndex };
