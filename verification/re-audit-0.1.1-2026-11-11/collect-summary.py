import json,pathlib,datetime,hashlib
root=pathlib.Path.cwd();out=root/'verification/re-audit-0.1.1-2026-11-11'
read=lambda path:json.loads((root/path).read_text(encoding='utf-8-sig'))
core=read(out.relative_to(root)/'core-unit.json');unit=read('verification/remediation/re-audit-2026-11-11/unit.json')
old=read(out.relative_to(root)/'legacy-browser.json');reg=read('verification/remediation/re-audit-2026-11-11/browser.json')
probes=read(out.relative_to(root)/'probes.json');browser_probes=read(out.relative_to(root)/'browser-probes.json')
quality=read('verification/remediation/re-audit-quality-2026-11-11/report.json')
summary={
 'version':'0.1.1','source_commit':(out/'commit.txt').read_text(encoding='utf-8-sig').strip(),
 'completed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'verdict':'strict_acceptance_failed','product_changed':False,
 'core_unit':{'passed':core['numPassedTests'],'failed':core['numFailedTests']},
 'regression_unit':{'passed':unit['numPassedTests'],'failed':unit['numFailedTests']},
 'legacy_browser':old['stats'],'regression_browser':reg['stats'],
 'new_unit_probes':{'passed_controls':probes['numPassedTests'],'failed_contracts':probes['numFailedTests']},
 'new_browser_probes':{'passed_observations':browser_probes['stats']['expected'],'failed_contracts':browser_probes['stats']['unexpected']},
 'findings':{'RA01':'theme substring false positive','RA02':'explicit negation incorrectly resolves to excluded theme','RA03':'manifest/root viewBox mismatch accepted','RA04':'no application-owned catalogue load deadline; observational'},
 'quality_report':quality,
 'random_layouts':read(out.relative_to(root)/'stress-layouts.json'),
 'exports':{'comparisons':len(read(out.relative_to(root)/'exports/report.json')['comparisons']),'passed':read(out.relative_to(root)/'exports/report.json')['passed']},
 'ui':read(out.relative_to(root)/'ui/report.json'),
 'editor':read(out.relative_to(root)/'svg-editor/report.json'),
 'ready_zip':read(out.relative_to(root)/'ready-zip/report.json'),
 'published':read(out.relative_to(root)/'published/report.json'),
 'packages':read(out.relative_to(root)/'package-check.json'),
 'product_fingerprint':read(out.relative_to(root)/'source-fingerprint.json')['fingerprint'],
 'historical_only':['60 critical race repetitions','30 minute soak without periodic New/open/copy','clean source ZIP npm ci/build'],
 'not_verified_completely':['all prescribed race orders repeated 10x','slow-copy timeout branch','forced fallback','mixed 30-minute session with project transitions','independent novice usability session','employer access'],
 'site_access':{'audience':'owner only','allowed_users':1,'external_visitors':0,'changed':False},
 'report_sha256':hashlib.sha256((root/'AUDIT_V0.1.1.md').read_bytes()).hexdigest(),
}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
assert summary['core_unit']=={'passed':26,'failed':0}
assert summary['regression_unit']=={'passed':39,'failed':0}
assert old['stats']['expected']==38 and old['stats']['unexpected']==0
assert reg['stats']['expected']==52 and reg['stats']['unexpected']==0
assert summary['new_unit_probes']=={'passed_controls':2,'failed_contracts':4}
assert summary['new_browser_probes']=={'passed_observations':2,'failed_contracts':6}
assert summary['packages']['passed'] and summary['ready_zip']['passed'] and summary['published']['passed']
assert summary['ui']['passed'] and summary['exports']['comparisons']==54 and summary['exports']['passed']
assert not summary['random_layouts']['failures']
print(json.dumps({'summary_written':True,'verdict':summary['verdict'],'new_failed_unit':4,'new_failed_browser':6,'product_fingerprint':summary['product_fingerprint']},ensure_ascii=False))
