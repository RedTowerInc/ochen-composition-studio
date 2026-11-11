import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root='verification/stabilization-0.1.2/';
assert.equal((await read('package.json')).version,'0.1.2');
const fingerprint=await read('verification/source-fingerprint.json');
assert.equal(fingerprint.fingerprint,'6a29267d50ac6d45040529cd6244b318b79af6a33df49d5a6205e9b0a3593e6c','Product changed after the frozen test build');
for(const item of fingerprint.entries)assert.equal(createHash('sha256').update(await readFile(item.file)).digest('hex'),item.sha256,`Changed product: ${item.file}`);
const core=await read(root+'core-unit.json'),unit=await read('verification/remediation/v012-final-unit/unit.json');
const browser=await read('verification/remediation/v012-final-browser/browser.json'),legacy=await read(root+'legacy-final.json'),repeat=await read('verification/remediation/v012-race-orders-10x/browser.json');
const originalProbes=await read(root+'original-probes.json'),quality=await read('verification/remediation/v012-quality/report.json'),random=await read(root+'stress-layouts.json');
const exports=await read(root+'exports/report.json'),ui=await read(root+'ui/report.json'),soak=await read(root+'soak-mixed-final/report.json'),budget=await read(root+'budget/report.json'),editor=await read(root+'svg-editor/report.json'),rebuild=await read(root+'clean-build.json');
for(const [result,count] of [[core,26],[unit,76],[originalProbes,6]]){
 assert.equal(result.numPassedTests,count);assert.equal(result.numFailedTests,0);assert.equal(result.numPendingTests,0);
}
for(const [result,count] of [[browser,94],[legacy,38],[repeat,340]]){
 assert.equal(result.stats.expected,count);assert.equal(result.stats.unexpected,0);assert.equal(result.stats.skipped,0);assert.equal(result.stats.flaky,0);
}
assert.equal(quality.candidateCount,9720);assert.equal(quality.pairFailures.length,0);assert.equal(quality.failures.length,0);
assert.equal(random.sets,1400);assert.equal(random.failures.length,0);
assert.equal(exports.comparisons.length,54);assert.equal(Math.max(...exports.comparisons.map(x=>x.mae)),0);assert.equal(exports.passed,true);
assert.equal(ui.passed,true);assert.equal(budget.passed,true);assert.equal(budget.pixels.previewVsFresh,0);assert.equal(budget.pixels.userVsFresh,0);
assert.equal(editor.results.length,3);assert.ok(editor.results.every(x=>x.images===0&&x.paths>0));assert.equal(editor.results[0].editedNode,true);
assert.equal(soak.passed,true);assert.ok(soak.elapsedSeconds>=1800);assert.ok(soak.transitions.length>=10);assert.equal(soak.restoredExactly,true);assert.equal(soak.errors.length,0);
assert.equal(rebuild.passed,true);assert.equal(rebuild.runtimeFiles,51);assert.deepEqual(rebuild.differences,[]);
const report={version:'0.1.2',generatedAt:new Date().toISOString(),productFingerprint:fingerprint.fingerprint,codeAcceptancePassed:true,
 unit:{core:26,regression:76,total:102,originalProbeControls:6},browser:browser.stats,legacy:legacy.stats,raceRepeats:repeat.stats,
 quality:{sets:quality.pairSets,candidates:quality.candidateCount,alphaScenes:quality.renderedScenes,alphaInstances:quality.renderedInstances},random,
 exports:{comparisons:54,maxMAE:0},ui,soak,budget,cleanBuild:rebuild,
 externalLimits:['Figma online freshness: retained originals; MCP limit','WebKit and other operating systems','physical touch hardware','SVG-edit native file picker','employer access; audience remains owner-private']};
await writeFile(root+'summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,unit:102,browser:132,raceRepetitions:340,soakSeconds:soak.elapsedSeconds,projectRoundTrips:soak.transitions.length,fingerprint:fingerprint.fingerprint}));
