#!/usr/bin/env bash
# SAFE GATE: Read-only Google Cloud metadata audit, no IAM changes, deploy, billing changes, or data writes.
set -uo pipefail
PROJECT="${PROJECT_ID:-gen-lang-client-0758285251}"
REGION="${REGION:-asia-southeast1}"
DB="${FIRESTORE_DATABASE_ID:-ai-studio-remixagentwebapp-85ba5ffc-47a5-4b4d-b3d8-783a2d1a695a}"
if ! command -v gcloud >/dev/null 2>&1; then echo 'BLOCKED: gcloud CLI unavailable; no cloud calls executed.'; exit 2; fi
if [[ "$PROJECT" != 'gen-lang-client-0758285251' || "$DB" != 'ai-studio-remixagentwebapp-85ba5ffc-47a5-4b4d-b3d8-783a2d1a695a' ]]; then
  echo 'BLOCKED: project/database differs from reviewed Remix baseline. No calls executed.'; exit 2
fi
printf 'READ-ONLY cloud audit: project=%s region=%s database=%s\n' "$PROJECT" "$REGION" "$DB"
run_check() {
  local label="$1"; shift
  local output
  if output=$("$@" 2>&1); then
    printf '\n=== %s ===\n%s\n' "$label" "${output:-[no items]}"
  else
    # Do not silently interpret access denied as resource absent.
    printf '\n=== %s: BLOCKED / insufficient permission / API disabled ===\n' "$label"
    printf '%s\n' "$output" | head -c 600
    printf '\n'
  fi
}
run_check 'Billing enabled status (no billing account identifier)' gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)'
run_check 'Named Firestore database metadata' gcloud firestore databases describe --project="$PROJECT" --database="$DB" --format='json(name,locationId,type)'
run_check 'Existing Cloud Run service names' gcloud run services list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)'
run_check 'Existing user-managed Service Account names' gcloud iam service-accounts list --project="$PROJECT" --format='value(email)'
run_check 'Cloud Storage bucket names' gcloud storage buckets list --project="$PROJECT" --format='value(name)'
run_check 'Secret names only, no secret versions or contents' gcloud secrets list --project="$PROJECT" --format='value(name)'
run_check 'Enabled API service names' gcloud services list --enabled --project="$PROJECT" --format='value(config.name)'
printf '\n=== Conditional datastore.user IAM bindings (project metadata only) ===\n'
# Check matching roles and conditions without printing the full IAM policy.
policy=$(gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null)
if [[ $? != 0 || -z "$policy" ]]; then
  echo 'BLOCKED: IAM policy unreadable. Do not infer no bindings.'
else
  printf '%s\n' "$policy" | python3 -c '
import json,sys
try:
  obj=json.load(sys.stdin)
  records=[b for b in obj.get("bindings",[]) if b.get("role")=="roles/datastore.user"]
  if not records: print("No datastore.user bindings visible (other inherited roles are not evaluated).")
  for b in records:
    cond=b.get("condition") or {}
    print("role=datastore.user members="+",".join(b.get("members",[])))
    print("condition="+cond.get("expression","NONE; project-wide"))
except Exception:
  print("BLOCKED: IAM response could not be parsed.")
'
fi
printf '\nFINISHED: metadata read only. Never assume Cloud Run can read Firestore until live authenticated test passes.\n'
