import hashlib,json,pathlib,zipfile
root=pathlib.Path.cwd()
out=root/'verification/re-audit-0.1.1-2026-11-11'
release_dir=root.parent/'deliverables/v0.1.1'
release=json.loads((release_dir/'release.json').read_text(encoding='utf-8'))
fingerprint=json.loads((out/'source-fingerprint.json').read_text(encoding='utf-8'))
runtime=json.loads((root/'verification/remediation/runtime-manifest.json').read_text(encoding='utf-8'))
digest=lambda data:hashlib.sha256(data).hexdigest()
report={'version':release['version'],'commit':release['source_commit'],'archives':{},'dist_differences':[]}
for kind,item in release['archives'].items():
    archive=release_dir/item['file']
    differences=[]
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        for entry in fingerprint['entries']:
            name=entry['file']
            if name not in names or digest(z.read(name))!=entry['sha256']:differences.append(name)
        if kind=='ready':
            for name,expected in runtime.items():
                if name not in names or digest(z.read(name))!=expected:differences.append(name)
        required=['README.md','ARCHITECTURE.md','AI_TOOLS.md','DEMO.md','examples/focus.svg','examples/ideas.svg','examples/balance.svg']
        missing=[name for name in required if name not in names]
        demo=[name for name in names if name.endswith(('.webm','.mp4'))]
    report['archives'][kind]={'sha256':digest(archive.read_bytes()),'hash_matches':digest(archive.read_bytes())==item['sha256'],'files':len(names),'source_files_checked':len(fingerprint['entries']),'differences':differences,'missing_delivery_documents':missing,'videos':demo}
for name,expected in runtime.items():
    if digest((root/name).read_bytes())!=expected:report['dist_differences'].append(name)
report['passed']=not report['dist_differences'] and all(x['hash_matches'] and not x['differences'] and not x['missing_delivery_documents'] and x['videos'] for x in report['archives'].values())
(out/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
if not report['passed']:raise SystemExit(1)
