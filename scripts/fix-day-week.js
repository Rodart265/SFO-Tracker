#!/usr/bin/env node
/**
 * One-off cleanup: make `day` and `week` agree with `date` on existing check-ins.
 *
 * WHY
 * Check-ins were seeded with a planned week + weekday and an empty date. People
 * later set dates by hand, and the app let Day, Week and Date be edited
 * independently, so some records disagree (e.g. date 2026-09-15 is a Tuesday
 * but day is "Monday"). The app now derives day/week from the date; this script
 * fixes the records created before that change.
 *
 * SAFE BY DEFAULT
 *   node fix-day-week.js                  dry run: prints what WOULD change
 *   node fix-day-week.js --apply          writes a backup file, then applies
 *   node fix-day-week.js --week1-monday=2026-09-14   force the Week 1 anchor
 *
 * Run from this scripts/ folder with admin credentials, same as the seed script:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node fix-day-week.js
 *
 * What it touches: only `day` and `week`, and only on check-ins that have a
 * valid date. It does NOT touch `updatedAt` (the app's "Visit completed"
 * activity feed reads that field as the completion time). Undated check-ins
 * are left alone. Weekend dates keep their stored day.
 *
 * Week 1's Monday is inferred from the dated check-ins (majority vote). Check
 * the anchor in the dry-run output; override it with --week1-monday if wrong.
 */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const validISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00"));
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return fmt(d); };
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (iso) => addDays(iso, -((new Date(iso + "T00:00:00").getDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const weekdayName = (iso) => { const n = new Date(iso + "T00:00:00").getDay(); return n >= 1 && n <= 5 ? DAYS[n - 1] : null; };

/* docs: [{ id, ...checkinFields }]. Returns { start, votes, changes }. Pure, so it can be tested. */
function planChanges(docs, forcedStart) {
  const votes = {};
  docs.forEach((c) => {
    if (!validISO(c.date) || !Number.isFinite(c.week) || c.week < 1) return;
    const s = addDays(mondayOf(c.date), -7 * (c.week - 1));
    votes[s] = (votes[s] || 0) + 1;
  });
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const start = forcedStart || (ranked[0] && ranked[0][0]) || null;
  const changes = [];
  docs.forEach((c) => {
    if (!validISO(c.date)) return;
    const patch = {};
    const wd = weekdayName(c.date);
    if (wd && wd !== c.day) patch.day = wd;
    if (start) {
      const w = Math.floor(daysBetween(start, c.date) / 7) + 1;
      if (w >= 1 && w !== c.week) patch.week = w;
    }
    if (Object.keys(patch).length) changes.push({ id: c.id, site: c.siteId, date: c.date, was: { day: c.day, week: c.week }, patch });
  });
  return { start, votes: ranked, changes };
}
module.exports = { planChanges };

if (require.main === module) {
  const fs = require("fs");
  const admin = require("firebase-admin");
  const apply = process.argv.includes("--apply");
  const forced = (process.argv.find((a) => a.startsWith("--week1-monday=")) || "").split("=")[1];
  if (forced && !validISO(forced)) { console.error("--week1-monday must look like 2026-09-14"); process.exit(1); }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  (async () => {
    const snap = await db.collection("checkins").get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { start, votes, changes } = planChanges(docs, forced);
    console.log(`Check-ins: ${docs.length} (${docs.filter((c) => validISO(c.date)).length} dated)`);
    console.log(`Week 1 Monday used: ${start || "none (no dated check-ins)"}${forced ? " (forced)" : ""}`);
    console.log("Anchor votes:", votes.map(([k, n]) => `${k} x${n}`).join(", ") || "none");
    if (votes.length > 1 && !forced) console.log("WARNING: dated check-ins disagree on the anchor. Review the changes below, or pass --week1-monday.");
    changes.forEach((c) => console.log(`${c.id}  ${c.site}  ${c.date}  ${JSON.stringify(c.was)} -> ${JSON.stringify(c.patch)}`));
    console.log(`\n${changes.length} check-in(s) would change.`);
    if (!apply) { console.log("Dry run only. Re-run with --apply to write them."); return; }
    if (!changes.length) return;

    const file = `checkins-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    console.log(`Backup written: ${file} (keep it outside git; it is ignored by .gitignore)`);
    for (let i = 0; i < changes.length; i += 400) {
      const batch = db.batch();
      changes.slice(i, i + 400).forEach((c) => batch.update(db.collection("checkins").doc(c.id), c.patch));
      await batch.commit();
    }
    console.log("Applied.");
  })().catch((e) => { console.error(e); process.exit(1); });
}
