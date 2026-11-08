#!/usr/bin/env node
// Reads the newest Card Offer Hub export (Search all banks → Export all) so
// people and AI agents can query saved offers locally. Read-only; no network.
const { defaultExportDirectory, findLatestExport, loadOfferExport } = require('./offer-export-files.cjs');
const { filterOffers } = require('./offer-export-filter.cjs');
const { renderExportMarkdown } = require('./offer-export-markdown.cjs');

const USAGE = `Usage: node scripts/offers/read-offer-export.cjs [options]
  --file <path>       read this export instead of the newest one
  --dir <path>        folder to search for exports (default ${defaultExportDirectory()})
  --query <words>     every word must match bank, card, merchant, summary, details, terms or category
  --bank <id|name>    e.g. chase-offer-lite or Chase
  --status <status>   available | added | review | other
  --format <format>   markdown (default) | json
  --no-details        omit full details and terms from markdown
  --limit <n>         show at most n offers`;

function parseArguments(argv) {
    const options = { format: 'markdown', includeDetails: true };
    const valueOptions = { '--file': 'file', '--dir': 'directory', '--query': 'query', '--bank': 'bank',
        '--status': 'status', '--format': 'format', '--limit': 'limit' };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--help' || argument === '-h') return { help: true };
        if (argument === '--no-details') { options.includeDetails = false; continue; }
        const name = valueOptions[argument];
        if (!name || index + 1 >= argv.length) throw new Error(`Unknown or incomplete option: ${argument}\n${USAGE}`);
        options[name] = argv[++index];
    }
    if (!['markdown', 'json'].includes(options.format)) throw new Error(`Unknown format "${options.format}".\n${USAGE}`);
    if (options.limit !== undefined && !(Number.isSafeInteger(Number(options.limit)) && Number(options.limit) > 0)) {
        throw new Error('--limit must be a positive integer.');
    }
    return options;
}

function main(argv) {
    const options = parseArguments(argv);
    if (options.help) { process.stdout.write(`${USAGE}\n`); return; }
    const filePath = options.file || findLatestExport(options.directory);
    const exported = loadOfferExport(filePath);
    let offers = filterOffers(exported.offers, options);
    if (options.limit) offers = offers.slice(0, Number(options.limit));
    if (options.format === 'json') {
        process.stdout.write(`${JSON.stringify({ file: filePath, exportedAt: exported.exportedAt, release: exported.release,
            note: exported.note, coverage: exported.coverage, total: exported.offers.length, offers }, null, 2)}\n`);
    } else {
        process.stdout.write(renderExportMarkdown({ filePath, exported, offers, includeDetails: options.includeDetails }));
    }
}

try { main(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
