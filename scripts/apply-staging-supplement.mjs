#!/usr/bin/env node
/**
 * Fail-closed, idempotent merger for the reviewed AI Studio Remix baseline.
 * It only patches three narrowly-anchored fragments in server.ts.
 * Docker/Proxy support files must have already been added separately.
 * Never touches Firebase config, Firestore, IAM, rules, secrets or user data.
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'gen-lang-client-0758285251';
const DATABASE = 'ai-studio-remixagentwebapp-85ba5ffc-47a5-4b4d-b3d8-783a2d1a695a';
const imp = "import { createPreviewApiProxy } from './server/core/runtime/previewApiProxy';";
const hook = `// Preview-only adapter; opt-in to a dedicated IAM-enabled backend.
// This must stay ahead of local API routes and JSON body parsing for SSE/streaming.
if (process.env.AW_PREVIEW_API_UPSTREAM) {
  app.use('/api', createPreviewApiProxy(process.env.AW_PREVIEW_API_UPSTREAM));
}`;
const oldVite = "import { createServer as createViteServer } from 'vite';";
const lazyVite = "const { createServer: createViteServer } = await import('vite');";
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const one = (text,needle) => text.split(needle).length === 2;

export function prepareServerPatch(input) {
  const all=[input.includes(imp),input.includes(hook),input.includes(lazyVite)];
  const remainingOld=input.includes(oldVite);
  if (all.every(Boolean) && !remainingOld) return {kind:'ALREADY_APPLIED',output:input};
  // Fail closed for partial/foreign edits. Never repair an unknown server.ts blindly.
  if (all.some(Boolean)) throw new Error('PARTIAL_PATCH: server.ts contains only part of reviewed adapter; manual diff required.');
  if (!remainingOld || !one(input, oldVite)) throw new Error('SOURCE_DRIFT: expected exactly one Vite static import.');
  const listenImport = "import { resolveListenHost } from './server/core/runtime/listenHost';";
  const limiter = "app.use('/api', limiter);";
  const devHook = "if (process.env.NODE_ENV === 'development') {\n    const vite = await createViteServer({";
  for (const anchor of [listenImport,limiter,devHook]) {
    if (!one(input,anchor)) throw new Error(`SOURCE_DRIFT: unexpected or repeated anchor: ${anchor.slice(0,70)}`);
  }
  if (!input.includes("adminAuth") && !input.includes('ServerIdentityProvider')) {
    throw new Error('SOURCE_DRIFT: canonical authentication wiring not identifiable.');
  }
  const output=input
    .replace(`${oldVite}\n`,'')
    .replace(listenImport, `${listenImport}\n${imp}`)
    .replace(limiter, `${limiter}\n\n${hook}`)
    .replace(devHook, "if (process.env.NODE_ENV === 'development') {\n    // Vite is a devDependency: no eager import in the production container.\n    " + lazyVite + "\n    const vite = await createViteServer({");
  if (!output.includes(lazyVite) || output.includes(oldVite) || !output.includes(hook)) {
    throw new Error('INTERNAL_ERROR: generated source failed safety checks.');
  }
  return {kind:'READY',output};
}

export function precheck(rootDir=root) {
  const read = file => readFileSync(join(rootDir,file),'utf8');
  const pkg=JSON.parse(read('package.json'));
  const conf=JSON.parse(read('firebase-applet-config.json'));
  const firebase=JSON.parse(read('firebase.json'));
  if (pkg.scripts?.dev !== 'tsx server.ts' || pkg.scripts?.start !== 'node dist/server.cjs' ||
      !pkg.scripts?.build?.includes('esbuild server.ts')) {
    throw new Error('SOURCE_DRIFT: package.json scripts differ; do not overwrite package.json.');
  }
  if (conf.projectId !== PROJECT || conf.firestoreDatabaseId !== DATABASE ||
      firebase.firestore?.length !== 1 || firebase.firestore[0]?.database !== DATABASE) {
    throw new Error('DATABASE_DRIFT: project/database do not match reviewed Remix baseline.');
  }
  for (const file of ['Dockerfile.staging','Dockerfile.staging.dockerignore',
       'server/core/runtime/previewApiProxy.ts','server/core/runtime/listenHost.ts']) {
    if (!existsSync(join(rootDir,file))) throw new Error(`MISSING_REQUIRED_FILE: ${file}`);
  }
  return prepareServerPatch(read('server.ts'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apply=process.argv.includes('--apply');
  if (process.argv.some(v=>v.startsWith('--') && !['--apply','--check'].includes(v))) {
    console.error('Allowed options: --check or --apply');process.exitCode=2;
  } else try {
    const result=precheck(root);
    if (result.kind === 'ALREADY_APPLIED') {
      console.log('PASS ALREADY_APPLIED: server.ts staging bridge is already integrated.');
    } else if (!apply) {
      console.log('READY_TO_APPLY: source baseline matches. Run with --apply to patch only server.ts.');
    } else {
      const target=join(root,'server.ts'),temp=join(root,'server.ts.staging-merge-tmp');
      try {writeFileSync(temp,result.output,{flag:'wx',mode:0o644}); renameSync(temp,target);}
      catch(e) {if(existsSync(temp))unlinkSync(temp);throw e;}
      console.log('PASS APPLIED: modified server.ts in place; no other existing files changed.');
    }
  } catch(err) {
    console.error(`BLOCKED: ${err?.message ?? err}`);process.exitCode=1;
  }
}
