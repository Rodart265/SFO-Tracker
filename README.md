# SFO-Tracker

A single-file Firebase PWA for tracking field visits to nursery/planting
sites — schedule, per-visit observations, a site & team roster, and basic
analytics.

## First-time setup (or after pulling this update)

The site directory (names, phone numbers, nursery IDs) and the initial
check-in schedule are seeded into Firestore by a script instead of being
hardcoded into `index.html`, so that data never ships in the public page.

```
cd scripts
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json node seed-firestore.js
```

Get the service account key from Firebase console → Project settings →
Service accounts → "Generate new private key". Keep it outside this repo
(the `.gitignore` also blocks common key filenames as a backstop).

The script is idempotent — it checks `meta/schemaV2.done` in Firestore
and exits immediately if setup has already run. See the comment at the
top of `scripts/seed-firestore.js` for details on what it does.

Until that script has been run at least once, the app will show
"Setup incomplete — ask an admin to run the seed script" instead of data.
 