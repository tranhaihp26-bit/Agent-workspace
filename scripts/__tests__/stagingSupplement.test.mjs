import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareServerPatch, precheck } from '../apply-staging-supplement.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const source=readFileSync(resolve(root,'server.ts'),'utf8');
test('staging merger accepts fully integrated reviewed server without changing bytes',()=>{
 const result=prepareServerPatch(source);
 assert.equal(result.kind,'ALREADY_APPLIED');
 assert.equal(result.output,source);
});
test('merger rejects partial edits and cannot silently duplicate proxy registration',()=>{
 assert.throws(()=>prepareServerPatch(source.replace('if (process.env.AW_PREVIEW_API_UPSTREAM) {',"if (process.env.UPSTREAM_DIFFERENT) {")),/PARTIAL_PATCH/);
});
test('merger rejects unexpected or ambiguous Vite imports',()=>{
 const bad=source.replace("const { createServer: createViteServer } = await import('vite');",'');
 assert.throws(()=>prepareServerPatch(bad),/PARTIAL_PATCH/);
});
test('entire reviewed staging candidate passes baseline guard',()=>{
 assert.equal(precheck(root).kind,'ALREADY_APPLIED');
});
