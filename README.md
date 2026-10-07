# SFO-Tracker

A single-file Firebase PWA for tracking field visits to nursery/planting
sites: weekly schedule, start-of-visit GPS check-in, photos, notes and issues,
a site and team directory, and a this-week dashboard. It works offline and syncs
when signal returns.

| File | What it is |
|------|------------|
| `index.html` | the field app (installable PWA) |
| `admin.html` | admin page: sites, import, visits, team, week-1 date, oversight |
| `firestore.rules`, `storage.rules` | security rules (see below) |
| `docs/DATA-MODEL.md` | every collection and field |
| `scripts/` | one-off seed and clean-up scripts (need a service-account key) |

## Deploying (in this order)

1. **Storage**: Firebase console → Storage → Get started (once). Photos upload to
   `visits/<visitId>/…`. Without it the app still works; photos wait on the phone
   and the person sees "Photo storage isn't set up yet". Firebase may ask for the
   pay-as-you-go plan before it creates a default bucket; usage at this scale
   should stay within the free allowance, but check the Firebase pricing page.
2. **Push the app** (`index.html`, `service-worker.js`, `manifest.json`, icons,
   `admin.html`) to GitHub Pages. Phones that already installed it show "A new
   version is ready" and refresh. Bump `CACHE_NAME` in `service-worker.js` on
   every release.
3. **Publish `firestore.rules`** (Firestore → Rules). Do this *after* step 2: the
   new rules require every write to carry `updatedBy`, which the old app doesn't send.
4. **Publish `storage.rules`** (Storage → Rules).
5. Set the **Week 1 Monday** on the admin page's Program tab so every phone agrees
   on week numbers.

Test the rules in the Rules Playground (or the emulator: `firebase emulators:exec
--only firestore ...`) before publishing. Firestore needs a role document for every
person; see "Access control".

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
| `admin` | everything: also edit the site directory, `meta` and `users`, and delete visits, notes, weekly check-ins and photos |
| `member` | read everything; create and edit visits, notes and weekly check-ins; add photos |

A signed-in person with no `users` document, or any other role, sees a
"No access yet" screen with a Try again button. A phone that has signed in once keeps
working offline; a brand-new phone needs signal the first time.

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

## Fixing day/week on existing check-ins (one-off)

The app now derives a check-in's day and week from its date. Records created
before that change may disagree (e.g. dated Tuesday, filed under Monday). Run
the cleanup from `scripts/` — it is a dry run unless you pass `--apply`, and it
writes a backup JSON before changing anything:

```
cd scripts
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node fix-day-week.js            # preview
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node fix-day-week.js --apply    # write
```

Check the "Week 1 Monday used" line in the preview. If it is wrong, pass
`--week1-monday=YYYY-MM-DD` (and set `PROGRAM_WEEK1_MONDAY` in `index.html` to match).

## How the field app behaves (V1.0)

- **Sync pill** under the title shows exactly one of *Offline* (with how many changes
  are waiting), *Syncing* or *Synced · time*. Photos waiting to upload count as changes.
- **Start visit** records GPS position, accuracy and time, and compares it with the
  site's coordinates (within 300 m = `verified`). It never blocks the visit: with no
  GPS or permission the visit starts and the reason is stored. A second tap, or a
  second phone, can't create a second check-in.
- **Visit IDs** are `<date>_<site>_<assistant>_<purpose>`, so the same visit can't be
  added twice; editing a visit into a clash is refused.
- **Week numbers** come from the admin-set Week 1 Monday (`meta/program`) so all phones
  agree; day and week follow the date.
- **Audit fields** (`createdBy/At`, `updatedBy/At`, `startedBy`, `completedBy`) are
  written on every change and checked by the rules.
- Only admins see **Delete** on a visit.
