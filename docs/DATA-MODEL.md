# SFO Tracker data model (V1.0)

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

`visitId = <date>_<siteId>_<assistantSlug>_<purposeSlug>` (lowercase, a-z0-9 and hyphens)

The app refuses to add or edit a visit into a collision with an existing one. If
two phones add the very same visit while both are offline they write the same
document, so the second sync overwrites the first with identical content rather
than creating a copy.

Older visits keep their old random IDs; the app also detects duplicates by
comparing `date + siteId + assistant + purpose` across all visits.

| field | type | notes |
|-------|------|-------|
| siteId, epa, assistant, purpose | string | |
| date | `YYYY-MM-DD` | the one fact people set by hand |
| day | string | Monday to Friday, derived from `date` |
| week | number | program week, derived from `date` and `meta/program.week1Monday` |
| status | string | `Pending`, `Completed`, `Rescheduled`, `Skipped` |
| statusNote | string | reason for skip or reschedule |
| rescheduledFrom | `YYYY-MM-DD` or "" | |
| checklistItems, checkedItems | string[], boolean[] | |
| order | number | |
| startedAt, startedBy | server, email | set when "Start visit" is tapped. A visit counts as started once `startedBy` or `evidence.start` exists (`startedAt` reads as empty offline until the server confirms). The start check-in cannot be overwritten by a member. |
| completedAt, completedBy | server, email | set when marked Completed; cleared if reopened |
| evidence | map | see below |
| photos | array of map | `{ path (Cloudinary public ID), url, takenAtMs, takenBy }`; at most 20, only ever grows for members |
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
| `verified` | fix is within `radiusM` of the site (accuracy is allowed for) |
| `far` | fix is farther than `radiusM` from the site |
| `no-site-gps` | the site has no coordinates to compare with |
| `no-fix` | GPS timed out or was unavailable |
| `denied` | the person refused location permission |
| `unsupported` | the device has no geolocation |

`lat`, `lng`, `accuracyM`, `distanceM` are `null` when there was no fix.
`radiusM` defaults to 300.

## observations/{id}
Notes, issues, actions and follow-ups. New ones carry `author` (email, the creator,
never changes), `createdAt/createdBy` and `updatedAt/updatedBy`; every later edit
(status change, report bucket) refreshes `updatedAt/updatedBy`. Older notes without
the audit fields keep working.

## weeklyCheckins/{week}
Unchanged, plus `createdAt`, `createdBy` (first save) and `updatedBy`.

## meta/program
`{ week1Monday: "YYYY-MM-DD", updatedAt, updatedBy }`. Admin-set. All phones read
it, so week numbers agree everywhere. When missing, the app falls back to
inferring it from dated visits.

## users/{uid}
| field | type | notes |
|-------|------|-------|
| role | string | `admin`, `sfo`, `member` (older role, same access as `sfo` for now), `fa` (no access yet, see V2 phase 2); anything else means no access |
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
A Field Assistant as a person, separate from any login. `faId` is `slugify(name)`. Created from the admin Team tab; admins write, SFOs and members read.

| field | type | notes |
|-------|------|-------|
| name | string | as written on the sites |
| supervisorUid, supervisorEmail | string | the SFO who supervises this FA |
| active | boolean | |
| linkedUid | string or null | the FA's login `users/<uid>`, set when they get one |
| createdAt/By, updatedAt/By | | audit |

The site entry with assistant `N/A` is the office placeholder, not an FA, and gets no record.

## assistantId (V2 release A)
`sites`, `checkins` and `observations` carry `assistantId`: the `fieldAssistants` id of the FA responsible (`slugify(assistant)`; `null` for the N/A office entry). New visits and notes get it automatically; notes take the site's FA at the time. Older records are filled in once with the admin Team tab button "Link existing records to FAs". Reassigning a site moves only its Pending visits; completed visits stay with the FA who did them.

## recordedByRole and review (V2 release B)
`checkins`, and `observations`, carry `recordedByRole`: the role of whoever typed the record (`fa`, `sfo`, `admin`, `member`). Records without it were entered by the SFO. It is a display label; `createdBy` stays the audit truth.
`checkins.review` is `{status: "verified" | "followup", by, atMs}`, set by a Verify / Needs follow-up button an SFO or admin sees on started visits. Field Assistants cannot change it (rules). The team list shows capacity (18, the same for every FA), assigned, scheduled and done per week, plus overdue visits, sites not visited this week, open follow-ups and visits whose GPS evidence is missing or far from the site.

## Ownership (V2 release C)
`checkins` and `observations` carry `ownerType` (`fa` or `sfo`), `ownerUid`, `assistantId` and `sfoUid`; `sites` carry `assistantId` and `sfoUid`. An FA's records belong to the FA and are tagged with the SFO who supervises him (`fieldAssistants/<id>.supervisorUid`). An SFO's records belong to that SFO and are never shown to FAs. An SFO reads his own and his FAs' records and writes only his own; on an FA's visit he can change only `review`, and on any note only the done mark. An FA can also read and mark done a follow-up an SFO assigned to him (`assignedTo` equals his name). The admin Team tab sets each FA's supervisor, and "Sync records with assignments" re-tags older or reassigned records. The older `member` role is treated like an SFO.
