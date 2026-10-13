#!/usr/bin/env node
/** Dependency-free, read-only source preflight for the current Agent Workspace. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function auditStagingSource(root) {
  const findings = [];
  const assert = (name, condition, details = '') => findings.push({name, passed:Boolean(condition), details});
  const read = (path) => readFileSync(join(root,path), 'utf8');
  const exists = path => existsSync(join(root,path));
  let config, fb, pkg, server, docker, ignore, proxy;
  try {
    config = JSON.parse(read('firebase-applet-config.json'));
    fb = JSON.parse(read('firebase.json'));
    pkg = JSON.parse(read('package.json'));
    server = read('server.ts');
    docker = read('Dockerfile.staging');
    ignore = read('Dockerfile.staging.dockerignore');
    proxy = read('server/core/runtime/previewApiProxy.ts');
  } catch (err) {return [{name:'critical source files present', passed:false, details:err.message}];}
  const db = config.firestoreDatabaseId;
  assert('Firebase project matches approved baseline', config.projectId === 'gen-lang-client-0758285251');
  assert('Named Firestore database matches exact Remix baseline', db === 'ai-studio-remixagentwebapp-85ba5ffc-47a5-4b4d-b3d8-783a2d1a695a');
  assert('Firestore deploy config targets same database', fb.firestore?.length === 1 && fb.firestore[0]?.database===db);
  assert('Express dev entry point is preserved', pkg.scripts?.dev==='tsx server.ts');
  assert('Production uses built Express entry point',pkg.scripts?.start==='node dist/server.cjs' && pkg.scripts?.build?.includes('esbuild server.ts'));
  assert('Cloud Run container uses reviewed production build', docker.includes('npm run build') && docker.includes('npm ci --omit=dev') && docker.includes('CMD ["node", "dist/server.cjs"]'));
  assert('Container port contract is consistent',docker.includes('EXPOSE 3000') && /const PORT = 3000/.test(server) && /production.*0\.0\.0\.0/.test(read('server/core/runtime/listenHost.ts')));
  assert('Vite import is development-only', !/^\s*import[^\n]*\sfrom\s*['"]vite['"]/m.test(server) && /process\.env\.NODE_ENV === 'development'[\s\S]{0,500}await import\('vite'\)/.test(server));
  assert('Env and Git excluded from docker context', ['node_modules','dist','.git','.env','.env.*'].every(x => ignore.split(/\r?\n/).includes(x)));
  assert('No keyfile copied by Dockerfile', !/COPY[^\n]*(?:credential|service.account|\.env)/i.test(docker));
  assert('Preview adapter is disabled unless configured', server.includes('if (process.env.AW_PREVIEW_API_UPSTREAM)'));
  assert('Adapter is off in Cloud Run production', /NODE_ENV === 'production'/.test(proxy) && /must not run in production/.test(proxy));
  assert('Backend Auth bearer verification is preserved', read('server/core/auth/identityProvider.ts').includes('adminAuth.verifyIdToken(token)'));
  assert('Health checks real Firestore',server.includes('probeFirestoreAdmin()') && server.includes('adkSessionService.probePersistenceHealth()'));
  assert('Firestore is deny-all for web clients', /allow\s+read,\s*write\s*:\s*if\s+false/.test(read('firestore.rules')));
  let checksumOk = true; const bad = [];
  for(const line of read('PRODUCTION_SOURCE_MANIFEST.sha256').split(/\r?\n/).filter(Boolean)) {
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if(!m) {checksumOk=false;bad.push('invalid entry');continue;}
    const filepath = resolve(root,m[2]);
    if(!filepath.startsWith(resolve(root)+'/') || !exists(m[2])) {checksumOk=false;bad.push(m[2]);continue;}
    const actual = createHash('sha256').update(readFileSync(filepath)).digest('hex');
    if(actual !== m[1]) {checksumOk=false;bad.push(m[2]);}
  }
  assert('Production source SHA256 manifest matches', checksumOk, bad.join(', '));
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(fileURLToPath(new URL('..',import.meta.url)));
  const findings = auditStagingSource(root);
  findings.forEach(f=>console.log(`${f.passed ? 'PASS' : 'FAIL'}  ${f.name}${f.details?' — '+f.details:''}`));
  const passed = findings.filter(f=>f.passed).length;
  console.log(`Result: ${passed}/${findings.length} checks passed. This does not certify cloud IAM, secrets, build or live persistence.`);
  if(passed!==findings.length) process.exitCode=1;
}
