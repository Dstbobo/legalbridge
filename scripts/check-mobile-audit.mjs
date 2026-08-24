import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
assert.ok(reportPath, 'Usage: node scripts/check-mobile-audit.mjs <npm-audit.json>');

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
assert.equal(report.error, undefined, `npm audit failed: ${report.error?.summary ?? 'unknown error'}`);
assert.ok(report.vulnerabilities && report.metadata, 'npm audit returned an incomplete report');

// These exact advisories are currently constrained by application controls or
// are isolated to the Expo/Metro build toolchain. A new high/critical advisory,
// even on the same package, must fail this check and receive its own review.
const reviewedAdvisories = new Set([
  'GHSA-22p9-wv53-3rq4', // linkify-it: linkification disabled and input bounded
  'GHSA-v245-v573-v5vm', // linkify-it mailto scan: same controls
  'GHSA-w3rx-r6r6-pgpr', // image-size: Metro build-time parser only
  'GHSA-5p2g-fcmc-qvqq', // image-size: Metro build-time parser only
]);

const activeSeverities = new Set(['high', 'critical']);
const advisoryIds = new Set();

for (const vulnerability of Object.values(report.vulnerabilities)) {
  if (!activeSeverities.has(vulnerability.severity)) continue;
  for (const cause of vulnerability.via) {
    if (typeof cause !== 'object' || !cause.url || !activeSeverities.has(cause.severity)) continue;
    const match = cause.url.match(/GHSA-[\w-]+/u);
    if (match) advisoryIds.add(match[0]);
  }
}

const unreviewed = [...advisoryIds].filter((id) => !reviewedAdvisories.has(id));
assert.deepEqual(unreviewed, [], `unreviewed high/critical npm advisories: ${unreviewed.join(', ')}`);

const highOrCritical = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
if (highOrCritical > 0 && advisoryIds.size === 0) {
  throw new Error('high/critical vulnerabilities were reported without advisory identifiers');
}

console.log(`Mobile audit policy passed (${advisoryIds.size} reviewed high/critical advisories).`);
