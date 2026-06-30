#!/usr/bin/env bash
# List and remove duplicate Cloud Scheduler jobs for processDailyRoi.
# Run in Google Cloud Shell (Owner / Cloud Scheduler Admin):
#   bash scripts/cleanup-duplicate-roi-scheduler.sh
#
# Keeps ONE job: schedule "0 0 * * *", timeZone "Asia/Kolkata", state ENABLED.
# Deletes other processDailyRoi scheduler jobs (stale deploys / old cron expressions).

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-richpay-live-fe3f1}"
LOCATION="${CLOUD_SCHEDULER_LOCATION:-us-central1}"

echo "Project: $PROJECT  Location: $LOCATION"
echo ""

echo "=== All scheduler jobs (grep processDailyRoi) ==="
gcloud scheduler jobs list \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --format="table(name.basename(),schedule,timeZone,state,httpTarget.uri)" \
  | grep -i processdailyroi || true

echo ""
echo "=== JSON detail for processDailyRoi jobs ==="
gcloud scheduler jobs list \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --format=json \
  | node -e "
const jobs = JSON.parse(require('fs').readFileSync(0, 'utf8') || '[]');
const roi = jobs.filter((j) => /processdailyroi/i.test(j.name + (j.description || '') + (j.httpTarget?.uri || '')));
if (!roi.length) {
  console.log('No processDailyRoi scheduler jobs found.');
  process.exit(0);
}
for (const j of roi) {
  console.log(JSON.stringify({
    name: j.name.split('/').pop(),
    fullName: j.name,
    schedule: j.schedule,
    timeZone: j.timeZone,
    state: j.state,
  }, null, 2));
}
const keep = roi.filter((j) => j.schedule === '0 0 * * *' && j.timeZone === 'Asia/Kolkata' && j.state === 'ENABLED');
const stale = roi.filter((j) => !keep.includes(j));
console.log('');
console.log('KEEP (correct midnight IST):', keep.map((j) => j.name.split('/').pop()));
console.log('STALE (safe to delete):', stale.map((j) => j.name.split('/').pop()));
if (keep.length > 1) {
  console.log('');
  console.log('WARNING: multiple jobs match the correct schedule. Keep the newest; delete the rest manually.');
}
"

read -r -p "Delete STALE processDailyRoi jobs listed above? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted. No jobs deleted."
  exit 0
fi

gcloud scheduler jobs list \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --format=json \
  | node -e "
const { execSync } = require('child_process');
const project = process.env.PROJECT;
const location = process.env.LOCATION;
const jobs = JSON.parse(require('fs').readFileSync(0, 'utf8') || '[]');
const roi = jobs.filter((j) => /processdailyroi/i.test(j.name + (j.description || '') + (j.httpTarget?.uri || '')));
const keep = roi.filter((j) => j.schedule === '0 0 * * *' && j.timeZone === 'Asia/Kolkata' && j.state === 'ENABLED');
const keepOne = keep.slice(0, 1);
const stale = roi.filter((j) => !keepOne.includes(j));
for (const j of stale) {
  const id = j.name.split('/').pop();
  console.log('Deleting', id);
  execSync(
    'gcloud scheduler jobs delete ' + id + ' --project=' + project + ' --location=' + location + ' --quiet',
    { stdio: 'inherit' },
  );
}
if (!stale.length) console.log('Nothing to delete.');
" PROJECT="$PROJECT" LOCATION="$LOCATION"

echo ""
echo "Done. Verify:"
gcloud scheduler jobs list \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --format="table(name.basename(),schedule,timeZone,state)" \
  | grep -i processdailyroi || echo "(no processDailyRoi jobs — redeploy functions to recreate)"
