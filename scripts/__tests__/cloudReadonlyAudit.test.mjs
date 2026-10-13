import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = resolve(fileURLToPath(new URL('../gcp-readonly-audit.sh',import.meta.url)));
function fixture(envOverrides={}) {
  const tmp=mkdtempSync(join(tmpdir(),'aw-cloud-readonly-'));
  const log=join(tmp,'calls.log');
  const fakeGcloud=join(tmp,'gcloud');
  writeFileSync(fakeGcloud,`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$AW_AUDIT_LOG"
if [[ "$1 $2" == 'projects get-iam-policy' ]]; then
  printf '{"bindings":[{"role":"roles/datastore.user","members":["serviceAccount:dummy@example.test"],"condition":{"expression":"resource.name==\\"projects/proj/databases/db\\""}}]}'
else
  echo 'fixture-result'
fi
`);
  chmodSync(fakeGcloud,0o755);
  const out=spawnSync('bash',[script],{
    env:{...process.env,PATH:tmp+':'+process.env.PATH,AW_AUDIT_LOG:log,...envOverrides},encoding:'utf8'
  });
  return {tmp,log,out, cleanup:()=>rmSync(tmp,{recursive:true,force:true})};
}
test('read-only audit invokes only allowlisted gcloud metadata commands',()=>{
 const f=fixture();
 try {
   assert.equal(f.out.status,0,f.out.stderr);
   const commands=readFileSync(f.log,'utf8').trim().split('\n');
   assert.equal(commands.length,8);
   const prefixes=['billing projects describe','firestore databases describe','run services list','iam service-accounts list','storage buckets list','secrets list','services list','projects get-iam-policy'];
   for(let i=0;i<commands.length;i++) assert.ok(commands[i].startsWith(prefixes[i]),commands[i]);
   assert.ok(f.out.stdout.includes('READ-ONLY cloud audit'));
 } finally {f.cleanup();}
});
test('database mismatch blocks all gcloud calls',()=>{
 const f=fixture({FIRESTORE_DATABASE_ID:'(default)'});
 try {
   assert.equal(f.out.status,2);
   assert.match(f.out.stdout,/BLOCKED: project\/database differs/);
   assert.equal(f.out.stdout.includes('fixture-result'),false);
 } finally {f.cleanup();}
});
