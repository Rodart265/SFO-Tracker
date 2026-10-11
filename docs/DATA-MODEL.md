# SFO Tracker data model (V1.1)

Every write goes through the signed-in person's Firebase Auth account. `email`
below always means `auth.currentUser.email`. Timestamps marked **server** are
`serverTimestamp()`; timestamps marked **ms** are plain numbers
(`Date.now()`), used where the device clock at the moment of capture is the
evidence.

## sites/{siteId}
`siteId` is `slugify(name)`. Written by admins only.

| field | type | notes |
|-------|------|-------|
| name | string | |
| epa | string | Chilaza / Ming'ongo / Mpingu / Office |
| assistant | string | field assistant (FA) name |
| assistantId | string or null | `slugify(assistant)`; `null` for the N/A office entry |
| sfoUid | string or null | uid of the SFO who supervises that FA. An SFO's phone only reads sites whose `sfoUid` is his, so the admin site form sets it from the FA record every time a site is saved. `null` when the FA has no supervisor yet. |
| nurseryId | string | |
| potfillingTarget | number or null | |
| nmName, nmPhone | string | nursery manager; phone as `+265XXXXXXXXX` |
| lat, lng | number or null | GPS of the nursery |
| status | string | `active` (default when missing), `paused`, `closed` |
| createdAt, createdBy | server, email | set once on creation |
| updatedAt, updatedBy | server, email | set on every write |

## checkins/{visitId}
New visits use a deterministic ID so the same visit can't be created twice,
even from two phones working offline:

`visitId = <date>_<siteId>_<assistantSlug>_<purposeSlug>_<ownerCode>` (lowercase, a-z0-9 and hyphens)

`ownerCode` is the first six characters of the creator's uid. Without it an SFO's visit
and an FA's visit for the same site, day and purpose got the same ID, and one write
replaced or was refused by the other. With it, each person's visit is a separate
document, and two phones of the same person that add the same visit while offline still
write one document.

The app refuses to add or edit a visit into a collision with one of the person's own
visits, and won't create a visit before the person's schedule has loaded.

Visits created before V1.1 have no owner code (and the oldest have random IDs); the app
also detects duplicates by comparing `date + siteId + assistant + purpose`.

| field | type | notes |
|-------|------|-------|
| siteId, epa, assistant, purpose | string | |
| date | `YYYY-MM-DD` | the one fact people set by hand |
| day | string | Monday to Saturday, derived from `date`. A Sunday date leaves the stored day alone. |
| week | number | program week, derived from `date` and `meta/program.week1Monday` |
| status | string | `Pending`, `Completed`, `Rescheduled`, `Skipped` |
| statusNote | string | reason for skip or reschedule |
| rescheduledFrom | `YYYY-MM-DD` or "" | |
| checklistItems, checkedItems | string[], boolean[] | |
| order | number | |
| startedAt, startedBy | server, email | set when "Start visit" is tapped. A visit counts as started once `startedBy` or `evidence.start` exists (`startedAt` reads as empty offline until the server confirms). The start check-in cannot be overwritten by a member, must carry the server's time in `startedAt` when it is first written, and cannot be present when a visit is created. |
| completedAt, completedBy | server, email | set when marked Completed; cleared if reopened |
| evidence | map | see below |
| photos | array of map | `{ path (Cloudinary public ID), url, takenAtMs, takenBy }`; the app stops at 10 per visit (`MAX_PHOTOS`), the rules allow up to 20; only ever grows for members |
| createdAt, createdBy | server, email | set once |
| updatedAt, updatedBy | server, email | every write |

### evidence
```
evidence: {
  start: { lat, lng, accuracyM, capturedAtMs, distanceM, radiusM, result },
  end:   { ...same shape, optional }
}
```
`result` is one of:

| result | meaning |
|--------|---------|
| `verified` | fix is within `radiusM` of the site, allowing at most 50 m for a poor GPS fix (`ACCURACY_CREDIT_M`) |
| `far` | fix is farther than `radiusM` from the site |
| `no-site-gps` | the site has no coordinates to compare with |
| `no-fix` | GPS timed out or was unavailable |
| `denied` | the person refused location permission |
| `unsupported` | the device has no geolocation |

`lat`, `lng`, `accuracyM`, `distanceM` are `null` when there was no fix.
`radiusM` defaults to 300.

## observations/{id}
Notes, issues, actions and follow-ups. Issues and follow-ups carry `assignedTo` (the person's name, for display) and `assignedToId` (the Field Assistant's id, `null` when unassigned). The id is what the rules and an FA's phone match on, so a name change cannot orphan a task. Tasks created before `assignedToId` existed get it from the admin Team tab button "Sync records with assignments"; until then an FA does not see them. New ones carry `author` (email, the creator,
never changes), `createdAt/createdBy` and `updatedAt/updatedBy`; every later edit
(status change, report bucket) refreshes `updatedAt/updatedBy`. Older notes without
the audit fields keep working.

## weeklyCheckins/{sfoUid}_{week}
One document per SFO per week, with `sfoUid` on it (the rules and the app's query both
match on it). Same content as before, plus `createdAt`, `createdBy` (first save) and
`updatedBy`. Before V1.1 there was one shared document per week (id = the week number, no
`sfoUid`), which let two SFOs overwrite each other. Those are readable by admins only. The
admin button "Sync records with assignments" copies each into the signed-in admin's own
document (`migratedFrom` names the old id; the old one is kept), and until then an admin's
first save of a week starts from the shared one.

## Weekly visit limits (soft)
The programme week is Monday to Saturday. A Field Assistant is expected in the field on
all six days; an SFO on four days of his own choosing. The app counts days with a visit
(Pending, Completed or Rescheduled, not Skipped) in the Monday-to-Saturday week of the
visit's date, and asks "Add anyway?" when a visit would be an extra day, a fourth-plus
visit in one day (`MAX_VISITS_PER_DAY` = 3), or on a Sunday. Nothing is stored for this and
the rules do not enforce it. Admins are not limited. Constants: `FA_VISIT_DAYS`,
`SFO_VISIT_DAYS`, `MAX_VISITS_PER_DAY` in `index.html`.

## Last visited
Not stored; computed. A site's last visit is its most recent Completed visit, dated by the
visit's `date` (or `completedAt` when it has none), counting visits by the SFO and by his
FAs. Green under 14 days, amber from 14, red from 21 (`STALE_AMBER_DAYS`, `STALE_RED_DAYS`).
A site with none is "Never visited" and shows in the attention list.

## Evidence clock check
`evidence.start.capturedAtMs` is the phone's clock; `startedAt` is the server's. The admin
Visits tab flags a visit ("Phone clock off") when they differ by more than 48 hours.

## meta/program
`{ week1Monday: "YYYY-MM-DD", updatedAt, updatedBy }`. Admin-set. All phones read
it, so week numbers agree everywhere. When missing, the app falls back to
inferring it from dated visits.

## users/{uid}
| field | type | notes |
|-------|------|-------|
| role | string | `admin`, `sfo`, `member` (older role, same access as `sfo` for now), `fa` (Field Assistant, needs `faId`); anything else means no access |
| active | boolean | `false` blocks the account; missing means active |
| faId | string | for role `fa`: the id of their `fieldAssistants` record (`slugify(name)`); an FA only reads and writes documents whose `assistantId` equals it |
| email | string | for display in the admin Team tab |
| name | string | optional display name |
| assistant | string | optional: the FA this person is |
| createdAt, updatedAt, updatedBy | | |

## Photos (Cloudinary)
JPEG photos, resized on the phone to at most 1280 px on the long side, uploaded with an
unsigned Cloudinary preset (`PHOTO_HOST` in `index.html`). In `checkins.photos`, `url` is
the Cloudinary `secure_url` and `path` is its public ID (`sfo-visits/<visitId>_<photoId>`).
Deleting a visit does not delete its photos from Cloudinary; remove them in its Media Library.

On the phone a photo first goes into an IndexedDB outbox (`sfo-outbox`), then uploads
and attaches itself to the visit when there is a connection. The photo ID never
changes, so a retry uses the same public ID and a photo that already uploaded is not
uploaded twice.

## fieldAssistants/{faId} (V2 phase 1)
A Field Assistant as a person, separate from any login. `faId` is `slugify(name)`. Created from the admin Team tab; only admins write. An SFO (or member) reads the Field Assistants he supervises, and an FA reads only his own record.

| field | type | notes |
|-------|------|-------|
| name | string | as written on the sites |
| supervisorUid, supervisorEmail | string | the SFO who supervises this FA |
| active | boolean | |
| linkedUid | string or null | the FA's login `users/<uid>`, set when they get one |
| createdAt/By, updatedAt/By | | audit |

The site entry with assistant `N/A` is the office placeholder, not an FA, and gets no record.

## assistantId (V2 release A)
`sites`, `checkins` and `observations` carry `assistantId`: the `fieldAssistants` id of the FA responsible (`slugify(assistant)`; `null` for the N/A office entry). New visits and notes get it automatically; notes take the site's FA at the time. Older records are filled in once with the admin Team tab button "Sync records with assignments". Reassigning a site moves only its Pending visits made by an SFO or admin; completed visits, and pending visits an FA made himself (`ownerType` `fa`), stay with the FA who made them. The admin site form says how many were left.

## recordedByRole and review (V2 release B)
`checkins`, and `observations`, carry `recordedByRole`: the role of whoever typed the record (`fa`, `sfo`, `admin`, `member`). Records without it were entered by the SFO. It is a display label; `createdBy` stays the audit truth.
`checkins.review` is `{status: "verified" | "followup", by, atMs}`, set by a Verify / Needs follow-up button an SFO or admin sees on started visits. Field Assistants cannot change it (rules). The team list shows days with visits this week (of 6), assigned sites, scheduled and done per week, plus overdue visits, sites not visited this week, open follow-ups and visits whose GPS evidence is missing or far from the site.

## Ownership (V2 release C)
`checkins` and `observations` carry `ownerType` (`fa` or `sfo`), `ownerUid`, `assistantId` and `sfoUid`; `sites` carry `assistantId` and `sfoUid`. An FA's records belong to the FA and are tagged with the SFO who supervises him (`fieldAssistants/<id>.supervisorUid`). An SFO's records belong to that SFO and are never shown to FAs. An SFO reads his own and his FAs' records and writes only his own; on an FA's visit he can change only `review`, and on any note only the done mark. An FA can also read and mark done a follow-up an SFO assigned to him (`assignedToId` equals his id) at one of his sites; these show on his Today screen under "My tasks", with or without a due date. On create, an SFO's visit or note must be about a Field Assistant he supervises (or an office entry with none), and an FA's visit or note must be at one of his own sites. If an FA's supervisor is changed while he is signed in, the app re-reads his record and retries a refused write once. The admin Team tab sets each FA's supervisor, and "Sync records with assignments" re-tags older or reassigned records. The older `member` role is treated like an SFO.
