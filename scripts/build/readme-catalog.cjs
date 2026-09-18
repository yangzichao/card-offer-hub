const { publishedFileUrl, publishedUserscriptFileName } = require('./repository.cjs');

const CATALOG_START_MARKER = '<!-- published-scripts:start -->';
const CATALOG_END_MARKER = '<!-- published-scripts:end -->';

// The install table in README.md is generated so a new script shows up for users
// the moment it is built, instead of waiting for someone to remember the README.
function buildCatalogTable(scripts) {
    const rows = scripts.map((script) => {
        const installUrl = publishedFileUrl(publishedUserscriptFileName(script.id));
        return `| [${script.name}](${script.toolDirectoryPath}/README.md) | ${script.issuer} | ${script.version} `
            + `| ${script.matches.join('<br>')} | [安装 / 更新](${installUrl}) |`;
    });
    return [
        CATALOG_START_MARKER,
        '',
        '| 脚本 | 发卡行 | 版本 | 生效站点 | 安装 |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
        '',
        CATALOG_END_MARKER
    ].join('\n');
}

function replaceCatalog(readmeText, scripts) {
    const startIndex = readmeText.indexOf(CATALOG_START_MARKER);
    const endIndex = readmeText.indexOf(CATALOG_END_MARKER);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(`README.md must contain the ${CATALOG_START_MARKER} / ${CATALOG_END_MARKER} markers around the script table.`);
    }
    return readmeText.slice(0, startIndex) + buildCatalogTable(scripts) + readmeText.slice(endIndex + CATALOG_END_MARKER.length);
}

module.exports = { buildCatalogTable, replaceCatalog, CATALOG_START_MARKER, CATALOG_END_MARKER };
