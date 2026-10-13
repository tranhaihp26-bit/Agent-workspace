# Agent Workspace — Repair of NO-GO due to incomplete Gate Only import

**Purpose**: Complement the 5-file Readonly Staging Gate Only package already loaded into AI Studio. This archive does not include or replace `server.ts`, `package.json`, Firebase credentials, Firestore rules, IAM, or data.

## Changes

- Add: `Dockerfile.staging`, `Dockerfile.staging.dockerignore`, `server/core/runtime/previewApiProxy.ts` (three missing dependencies).
- Add: two defensive Vitest tests and an idempotent source-merger script under `scripts/`.
- The merge script changes **only** three precise pieces of `server.ts`: eliminate eager Vite import; add proxy import and off-by-default middleware; lazy-load Vite in development.
- `package.json` remains unchanged because the reviewed source already has `dev = tsx server.ts`, `build` using esbuild, `start = node dist/server.cjs`.

## AI Studio instructions (after extracting this ZIP onto project root)

```
node scripts/apply-staging-supplement.mjs --check
node scripts/apply-staging-supplement.mjs --apply
node scripts/staging-preflight.mjs
node --test scripts/__tests__/*.test.mjs
```

If any command reports SOURCE_DRIFT or DATABASE_DRIFT: **stop** and diff with current source. Do not blindly overwrite `server.ts` or change Applet ID/database.

If `gcloud` is not present, cloud metadata remains BLOCKED; it is not a source error. Do not install a GCP CLI into AI Studio container or grant the sandbox IAM merely to pass this static gate. This supplement is not a cloud deployment and does not fix Firestore Admin `PERMISSION_DENIED`.

Keep `AW_PREVIEW_API_UPSTREAM` unset until a separately approved Cloud Run backend is running, verified and secured. The adapter fails closed in production.
