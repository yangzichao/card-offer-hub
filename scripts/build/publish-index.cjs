const { repositoryUrl, publishedFileUrl, publishedUserscriptFileName, REPOSITORY } = require('./repository.cjs');

// dist/index.json is the machine-readable catalog of everything published from
// this repository: one entry per script, with the exact address Tampermonkey
// installs and updates from. It carries no build timestamp, so rebuilding
// unchanged sources produces an identical file and "npm run check" stays honest.
function buildPublishIndex(scripts) {
    const index = {
        repository: repositoryUrl(),
        publishBranch: REPOSITORY.publishBranch,
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
