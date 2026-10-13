import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditStagingSource } from '../staging-preflight.mjs';
const root = resolve(fileURLToPath(new URL('../..',import.meta.url)));
test('reviewed source passes all static staging preflight checks',()=>{
 const checks = auditStagingSource(root);
 assert.equal(checks.every(x=>x.passed),true,JSON.stringify(checks.filter(x=>!x.passed)));
});
test('tampered task widget invalidates SHA manifest',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'aw-preflight-'));
 try {
   for(const f of [
     'firebase-applet-config.json','firebase.json','package.json','server.ts',
     'Dockerfile.staging','Dockerfile.staging.dockerignore','PRODUCTION_SOURCE_MANIFEST.sha256','firestore.rules',
     'server/core/runtime/listenHost.ts','server/core/runtime/previewApiProxy.ts',
     'server/core/auth/identityProvider.ts','src/app/shell/AppShell.tsx','src/modules/home/HomeModule.tsx',
     'src/modules/home/FileUploadCard.tsx','src/modules/tasks/TasksStatsWidget.tsx',
     'src/modules/home/__tests__/homeUx.test.ts']) {
     mkdirSync(dirname(join(tmp,f)),{recursive:true});cpSync(join(root,f),join(tmp,f));
   }
   const widget = join(tmp,'src/modules/tasks/TasksStatsWidget.tsx');
   writeFileSync(widget,readFileSync(widget,'utf8')+'\n// changed without updating manifest');
   const findings=auditStagingSource(tmp);
   assert.equal(findings.find(x=>x.name==='Production source SHA256 manifest matches')?.passed,false);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
test('database drift is rejected',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'aw-preflight-'));
 try {
   for(const file of ['firebase-applet-config.json','firebase.json','package.json','server.ts','Dockerfile.staging','Dockerfile.staging.dockerignore','PRODUCTION_SOURCE_MANIFEST.sha256','firestore.rules','server/core/runtime/listenHost.ts','server/core/runtime/previewApiProxy.ts','server/core/auth/identityProvider.ts', 'src/app/shell/AppShell.tsx','src/modules/home/HomeModule.tsx','src/modules/home/FileUploadCard.tsx','src/modules/tasks/TasksStatsWidget.tsx','src/modules/home/__tests__/homeUx.test.ts']) {mkdirSync(dirname(join(tmp,file)),{recursive:true}); cpSync(join(root,file),join(tmp,file));}
   const file='firebase-applet-config.json';
   const json=JSON.parse(readFileSync(join(tmp,file),'utf8'));
   json.firestoreDatabaseId='(default)';writeFileSync(join(tmp,file),JSON.stringify(json));
   const findings=auditStagingSource(tmp);
   assert.equal(findings.find(x=>x.name==='Named Firestore database matches exact Remix baseline')?.passed,false);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
