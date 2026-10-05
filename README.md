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
 
## Access control (Firestore rules and roles)

`firestore.rules` decides who can read and write what. Access is role-based.
Each person needs a document at `users/<their UID>` with a text field `role`:

| role | can do |
|------|--------|
| `admin` | everything: also edit the site directory, `meta` and `users`, and delete check-ins |
| `member` | read everything; create and edit check-ins, notes and weekly check-ins |

A signed-in person with no `users` document, or any other role, sees
"No access — ask an admin to add your account".

**Setting it up (do this in order — publishing the rules first locks everyone out):**

1. Firebase console → Authentication → Users: copy each person's **User UID**.
2. Firestore Database → Start collection `users` (first time) → Document ID =
   the UID → add field `role` (string) = `admin` or `member`. Do yours first,
   as `admin`, then add the rest of the team.
3. Firestore Database → Rules: copy the current rules somewhere safe, paste in
   the contents of `firestore.rules`, and use the **Rules Playground** to check
   a couple of reads and writes before pressing **Publish**.

The seed script uses the Admin SDK, which ignores these rules, so it is
unaffected. Site GPS coordinates are part of the seed script's `SITES_SEED`;
re-run the script after editing them.
