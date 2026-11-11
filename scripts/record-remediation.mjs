import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root='verification/remediation/';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
assert.equal((await read('package.json')).version,'0.1.1','This collector belongs to the historical 0.1.1 evidence; use record-stabilization.mjs for 0.1.2');
const fingerprint=await read('verification/source-fingerprint.json');
for(const item of fingerprint.entries)
 assert.equal(createHash('sha256').update(await readFile(item.file)).digest('hex'),item.sha256,`Changed product: ${item.file}`);
const unit=await read(root+'final-unit/unit.json'), browser=await read(root+'final-browser-complete/browser.json'), legacy=await read(root+'legacy-final.json'), repeat=await read(root+'race-repeat-10/browser.json');
const quality=await read(root+'A01-quality-final/report.json'), exports=await read(root+'export-matrix/report.json'), ui=await read(root+'ui-final/report.json'), soak=await read(root+'soak-30min/report.json'), zip=await read(root+'clean-zip/report.json'), rebuild=await read(root+'clean-zip/rebuild.json'), original=await read('verification/strict-audit/source-comparison.json');
const goodBrowser=result=>result.stats.unexpected===0&&result.stats.skipped===0&&result.stats.flaky===0;
const report={
 generatedAt:new Date().toISOString(),version:'0.1.1',productFingerprint:fingerprint.fingerprint,
 coreUnit:{passed:26,evidence:'npm test: successful final command, recorded in TEST_REPORT.md'},
 regressionUnit:{passed:unit.numPassedTests,failed:unit.numFailedTests,pending:unit.numPendingTests,success:unit.success},
 browser:browser.stats,legacy:legacy.stats,raceRepeats:repeat.stats,
 quality:{orderedSets:quality.pairSets,candidates:quality.candidateCount,geometryFailures:quality.pairFailures.length,renderedScenes:quality.renderedScenes,renderedInstances:quality.renderedInstances,paintFailures:quality.failures.length},
 exports:{comparisons:exports.comparisons.length,maxMAE:Math.max(...exports.comparisons.map(c=>c.mae)),passed:exports.passed},
 ui:{passed:ui.passed,viewports:ui.viewports.length,realChromeZoom:ui.browserZoom.map(z=>z.zoom)},
 originals:{variants:original.variants,geometry:original.allGeometryMatches,sourceHashes:original.sourceFilesHashesMatch},
 cleanZip:{passed:zip.passed,reproducibleRuntimeFiles:rebuild.runtimeFiles,differences:rebuild.differences},
 soak,
 notTested:['WebKit','other operating systems','physical touch hardware','SVG-edit native file dialog','employer access'],
 publicationEvidence:'release.json and published-qa in the corresponding delivery package; kept outside source to avoid changing the published commit',
};
report.codeAcceptancePassed=unit.success&&unit.numFailedTests===0&&unit.numPendingTests===0&&goodBrowser(browser)&&goodBrowser(legacy)&&goodBrowser(repeat)&&quality.pairFailures.length===0&&quality.failures.length===0&&exports.passed&&ui.passed&&zip.passed&&rebuild.passed&&original.allGeometryMatches&&original.sourceFilesHashesMatch&&soak.passed&&soak.elapsedSeconds>=1800;
await writeFile(root+'summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({codeAcceptancePassed:report.codeAcceptancePassed,unit:report.regressionUnit.passed,browser:browser.stats.expected,legacy:legacy.stats.expected,raceRepeats:repeat.stats.expected,soakSeconds:soak.elapsedSeconds,fingerprint:fingerprint.fingerprint}));
if(process.argv.includes('--require-complete'))assert.equal(report.codeAcceptancePassed,true,'Strict code acceptance is incomplete');
