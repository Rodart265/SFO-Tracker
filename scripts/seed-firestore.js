#!/usr/bin/env node
/**
 * One-time / idempotent Firestore seeding script for SFO Field Tracker.
 *
 * WHY THIS EXISTS
 * The site directory (real names + personal phone numbers of nursery
 * managers, nursery IDs, potfilling targets, GPS coordinates) and the
 * initial check-in schedule used to be hardcoded as constants inside
 * index.html. Since that file is served as a static, public page
 * (GitHub Pages), anyone could view-source it and read that data
 * without ever signing in. This script moves that data here, so it
 * only ever runs from a trusted machine with admin credentials and is
 * never shipped to a browser.
 *
 * SETUP (one-time)
 *   1. Firebase console -> Project settings -> Service accounts ->
 *      "Generate new private key". Save the downloaded JSON file
 *      somewhere OUTSIDE this repo, e.g. ~/secrets/sfo-tracker-key.json.
 *      Never commit this file — see the repo's .gitignore.
 *   2. In this scripts/ folder: npm install firebase-admin
 *
 * RUNNING IT
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sfo-tracker-key.json \
 *     node scripts/seed-firestore.js
 *
 * SAFE TO RE-RUN
 *   The `sites` upsert below (merge: true) always runs, every time —
 *   that's how you push future site-directory updates (new GPS
 *   coordinates, a corrected phone number, etc.) after initial setup.
 *   The one-time check-in migration is still gated on
 *   meta/schemaV2.done and only ever runs once.
 *
 * WHAT IT DOES
 *   1. Upserts every site in SITES_SEED into the `sites` collection
 *      (merge: true). Always runs — safe to re-run any time you edit
 *      SITES_SEED.
 *   2. On first run only: looks for a legacy `visits` collection —
 *        - if found, migrates each doc into `checkins` (+ an
 *          `observations` doc for any legacy notes), exactly like the
 *          old client code did;
 *        - if not found (fresh project), seeds `checkins` from
 *          LEGACY_SEED_VISITS instead, i.e. the default schedule.
 *      Then writes meta/schemaV2 = { done: true, ... } so this part
 *      never runs again.
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

/* ---- Site directory (moved out of index.html — contains real names,
   phone numbers, and GPS coordinates; keep this file out of any public
   bundle). lat/lng are null where no GPS submission exists yet — all
   7 of Richard Lipenga's sites (LLCH158xx) currently fall in that
   bucket, since the survey export didn't cover that EPA territory. ---- */
const SITES_SEED = {
  kango: { id: "kango", name: "Kango", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15401", potfillingTarget: 5850, nmName: "Lucy Gibison", nmPhone: "+265886020547", lat: -13.8752932, lng: 33.3877595 },
  mtolongo: { id: "mtolongo", name: "Mtolongo", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15402", potfillingTarget: 12350, nmName: "Sosten Mashatira", nmPhone: "+265891564987", lat: -13.939834, lng: 33.4252024 },
  kafunde: { id: "kafunde", name: "Kafunde", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15403", potfillingTarget: 9000, nmName: "Numeri Lundu", nmPhone: "+265880821189", lat: -13.9156981, lng: 33.3984962 },
  likanga: { id: "likanga", name: "Likanga", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15404", potfillingTarget: 7100, nmName: "Difficult Sunduza", nmPhone: "+265885456247", lat: -13.8850737, lng: 33.3960315 },
  masula: { id: "masula", name: "Masula", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15405", potfillingTarget: 8000, nmName: "Malijani James", nmPhone: "+265980726728", lat: -13.9278391, lng: 33.4125803 },
  palawo: { id: "palawo", name: "Palawo", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15406", potfillingTarget: 9100, nmName: "Suzana Nefitale", nmPhone: "+265889452704", lat: -13.9179251, lng: 33.4475833 },
  sinumbe: { id: "sinumbe", name: "Sinumbe", epa: "Chilaza", assistant: "Alfred Golowa", nurseryId: "LLCH15407", potfillingTarget: 7850, nmName: "Loice Bakili", nmPhone: "+265881949938", lat: -13.9066679, lng: 33.378192 },
  kanyoni: { id: "kanyoni", name: "Kanyoni", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15501", potfillingTarget: 5850, nmName: "Chifundo Aaron", nmPhone: "+265880093462", lat: -13.947862, lng: 33.4885421 },
  lundu: { id: "lundu", name: "Lundu", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15502", potfillingTarget: 9250, nmName: "Dikilani Visimba", nmPhone: "+265883848128", lat: -13.942201, lng: 33.5003918 },
  chamkondo: { id: "chamkondo", name: "Chamkondo", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15503", potfillingTarget: 8350, nmName: "Grey Manda", nmPhone: "+265896976117", lat: -13.9190944, lng: 33.5214496 },
  mpakiza: { id: "mpakiza", name: "Mpakiza", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15504", potfillingTarget: 11750, nmName: "Jazele Kabanco", nmPhone: "+265880899324", lat: -13.9331073, lng: 33.4814792 },
  mwaza: { id: "mwaza", name: "Mwaza", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15505", potfillingTarget: 6850, nmName: "Elemia Chionetselo", nmPhone: "+265889438313", lat: -13.9123526, lng: 33.491147 },
  kanyambwe: { id: "kanyambwe", name: "Kanyambwe", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15506", potfillingTarget: 7350, nmName: "Mateyo Kamphambe", nmPhone: "+265890562243", lat: -13.908375, lng: 33.5142418 },
  zambo: { id: "zambo", name: "Zambo", epa: "Chilaza", assistant: "Austin Bonongwe", nurseryId: "LLCH15507", potfillingTarget: 7600, nmName: "Nelson Potaziyo", nmPhone: "+265884805894", lat: -13.9332459, lng: 33.5076623 },
  katakungwa: { id: "katakungwa", name: "Katakungwa", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15601", potfillingTarget: 9850, nmName: "Steve Kazembe", nmPhone: "+265896539861", lat: -13.9986829, lng: 33.4664075 },
  mngongonda: { id: "mngongonda", name: "Mngongonda", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15602", potfillingTarget: 11100, nmName: "Bautala Masiteni", nmPhone: "+265886925801", lat: -13.9854982, lng: 33.4654847 },
  nkhwangwa: { id: "nkhwangwa", name: "Nkhwangwa", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15603", potfillingTarget: 5850, nmName: "Chisomo Njiwa", nmPhone: "+265891582918", lat: -13.9625402, lng: 33.4925357 },
  kanjawala: { id: "kanjawala", name: "Kanjawala", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15604", potfillingTarget: 7100, nmName: "Esawu Goster", nmPhone: "+265891564986", lat: -13.9479731, lng: 33.4353492 },
  santhe: { id: "santhe", name: "Santhe", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15605", potfillingTarget: 12250, nmName: "Chikaonga Kadengo", nmPhone: "+265891564983", lat: -13.92966, lng: 33.4262729 },
  khanda: { id: "khanda", name: "Khanda", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15606", potfillingTarget: 6500, nmName: "Trouble Kachiwaya", nmPhone: "+265882443371", lat: -14.0098179, lng: 33.4551184 },
  mpingo: { id: "mpingo", name: "Mpingo", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15607", potfillingTarget: 10100, nmName: "Matias Felix", nmPhone: "+265891703678", lat: -13.9785918, lng: 33.4372583 },
  muyala: { id: "muyala", name: "Muyala", epa: "Chilaza", assistant: "Davie James", nurseryId: "LLCH15608", potfillingTarget: 12850, nmName: "Rose Chambathuza", nmPhone: "+265891582910", lat: -13.9865021, lng: 33.4482668 },
  chimwala: { id: "chimwala", name: "Chimwala", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15701", potfillingTarget: 8850, nmName: "Sidney Sauzande", nmPhone: "+265891565003", lat: -13.9934512, lng: 33.4869409 },
  "chisikwa-caleb": { id: "chisikwa-caleb", name: "Chisikwa Caleb", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15702", potfillingTarget: 5850, nmName: "Gilbert Mvulayatera", nmPhone: "+265890890307", lat: -14.0078714, lng: 33.4759225 },
  dambo: { id: "dambo", name: "Dambo", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15703", potfillingTarget: 11000, nmName: "Tiyamike Abdah", nmPhone: "+265892541308", lat: -13.9594077, lng: 33.5148948 },
  dzoole: { id: "dzoole", name: "Dzoole", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15704", potfillingTarget: 9600, nmName: "Edison Kanthawi", nmPhone: "+265886167092", lat: -13.9743744, lng: 33.5130869 },
  ngalazuka: { id: "ngalazuka", name: "Ngalazuka", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15705", potfillingTarget: 5600, nmName: "Legias Kumsamila", nmPhone: "+265889499298", lat: -14.0090377, lng: 33.5011014 },
  kadyaudzu: { id: "kadyaudzu", name: "Kadyaudzu", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15706", potfillingTarget: 5750, nmName: "Felen Mbesa", nmPhone: "+265891583382", lat: -14.0163787, lng: 33.4959256 },
  nyemba: { id: "nyemba", name: "Nyemba", epa: "Chilaza", assistant: "Honest Gondwe", nurseryId: "LLCH15707", potfillingTarget: 5850, nmName: "Philimon Mthiko", nmPhone: "+265885352010", lat: -14.0187318, lng: 33.4889754 },
  chibungo: { id: "chibungo", name: "Chibungo", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15801", potfillingTarget: 14000, nmName: "Shadreck Kambaye", nmPhone: "+265891703658", lat: null, lng: null },
  kabwana: { id: "kabwana", name: "Kabwana", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15802", potfillingTarget: 7000, nmName: "Kalebe Rexson", nmPhone: "+265897349901", lat: null, lng: null },
  phulamazira: { id: "phulamazira", name: "Phulamazira", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15803", potfillingTarget: 9250, nmName: "Alick Null", nmPhone: "+265891564994", lat: null, lng: null },
  "mnjeza-2": { id: "mnjeza-2", name: "Mnjeza 2", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15804", potfillingTarget: 9250, nmName: "Lutele Mazuzo", nmPhone: "+265896548361", lat: null, lng: null },
  mzungu: { id: "mzungu", name: "Mzungu", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15805", potfillingTarget: 15250, nmName: "Bisiasi Gelevaziyo", nmPhone: "+265891564988", lat: null, lng: null },
  songole: { id: "songole", name: "Songole", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15806", potfillingTarget: 6500, nmName: "Salah Redson", nmPhone: "+265891255837", lat: null, lng: null },
  zindo: { id: "zindo", name: "Zindo", epa: "Chilaza", assistant: "Richard Lipenga", nurseryId: "LLCH15807", potfillingTarget: 17500, nmName: "Zikiel Josofati", nmPhone: "+265889700577", lat: null, lng: null },
  chilinda: { id: "chilinda", name: "Chilinda", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17701", potfillingTarget: 7250, nmName: "Peter Josephy", nmPhone: "+265884182476", lat: -14.0971139, lng: 33.5644776 },
  chimsolo: { id: "chimsolo", name: "Chimsolo", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17702", potfillingTarget: 6600, nmName: "Smith Chishindo", nmPhone: "+265884400293", lat: -14.113679, lng: 33.5421773 },
  chishasha: { id: "chishasha", name: "Chishasha", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17703", potfillingTarget: 7100, nmName: "Masautso Shawa", nmPhone: "+265997917742", lat: -14.0894798, lng: 33.5699248 },
  "mkanda-aloni": { id: "mkanda-aloni", name: "Mkanda-Aloni", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17704", potfillingTarget: 14350, nmName: "Lezinati Joza", nmPhone: "+265984730419", lat: -14.0957976, lng: 33.5251341 },
  mniu: { id: "mniu", name: "Mniu", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17705", potfillingTarget: 6350, nmName: "Steven Alfred", nmPhone: "+265888158366", lat: -14.1118833, lng: 33.5482167 },
  "kalasang-anga": { id: "kalasang-anga", name: "Kalasang'anga", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17706", potfillingTarget: 6100, nmName: "Silence Paliat", nmPhone: "+265890668672", lat: -14.0064487, lng: 33.5194619 },
  kombe: { id: "kombe", name: "Kombe", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17707", potfillingTarget: 11750, nmName: "Kayeseni Black", nmPhone: "+265889733967", lat: -14.0141277, lng: 33.5080625 },
  kudziwe: { id: "kudziwe", name: "Kudziwe", epa: "Ming'ongo", assistant: "Aubrey Kuyacha", nurseryId: "LLMI17708", potfillingTarget: 10600, nmName: "Frank Benat", nmPhone: "+265884277897", lat: -14.0268788, lng: 33.5480204 },
  mbwemba: { id: "mbwemba", name: "Mbwemba", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18001", potfillingTarget: 7850, nmName: "Jeusi Joshua", nmPhone: "+265888653371", lat: -14.0487405, lng: 33.4763549 },
  mdondwe: { id: "mdondwe", name: "Mdondwe", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18002", potfillingTarget: 6850, nmName: "Maxwell Kalamizu", nmPhone: "+265891583495", lat: -14.0421297, lng: 33.4894281 },
  madetsa: { id: "madetsa", name: "Madetsa", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18003", potfillingTarget: 7000, nmName: "Egelesoni Chilemba", nmPhone: "+265891255371", lat: -14.0815036, lng: 33.4686433 },
  mandala: { id: "mandala", name: "Mandala", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18004", potfillingTarget: 7000, nmName: "Aliness Nason", nmPhone: "+265882849580", lat: -14.0568585, lng: 33.4622867 },
  mchepa: { id: "mchepa", name: "Mchepa", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18005", potfillingTarget: 7000, nmName: "Lonjezo Kasalika", nmPhone: "+265890652126", lat: -14.0614579, lng: 33.4797268 },
  mphunda: { id: "mphunda", name: "Mphunda", epa: "Ming'ongo", assistant: "Tadala Mphwina", nurseryId: "LLMI18006", potfillingTarget: 14000, nmName: "Masautso Eliya", nmPhone: "+265889428981", lat: -14.0739522, lng: 33.4581188 },
  bingu: { id: "bingu", name: "Bingu", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19501", potfillingTarget: 16250, nmName: "Elisa Banda", nmPhone: "+265886327301", lat: -14.0289106, lng: 33.5860903 },
  chalenya: { id: "chalenya", name: "Chalenya", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19502", potfillingTarget: 11350, nmName: "Lesson Kapuza", nmPhone: "+265890657288", lat: -14.0493617, lng: 33.613395 },
  kanongona: { id: "kanongona", name: "Kanongona", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19503", potfillingTarget: 9600, nmName: "Philipina Mikayere", nmPhone: "+265887260287", lat: -14.0251383, lng: 33.6268133 },
  ndelendele: { id: "ndelendele", name: "Ndelendele", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19504", potfillingTarget: 10250, nmName: "Killiness Lingisoni", nmPhone: "+265882335512", lat: -14.0337083, lng: 33.6064133 },
  ndoliro: { id: "ndoliro", name: "Ndoliro", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19505", potfillingTarget: 11350, nmName: "Cosmas Gevinala", nmPhone: "+265891251982", lat: -14.0120783, lng: 33.5734967 },
  mkanda: { id: "mkanda", name: "Mkanda", epa: "Mpingu", assistant: "Martha Jacob", nurseryId: "LLMP19506", potfillingTarget: 8350, nmName: "Lucia Sinoya", nmPhone: "+265896561614", lat: -14.0052967, lng: 33.60416 },
  kamkundi: { id: "kamkundi", name: "Kamkundi", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19701", potfillingTarget: 7500, nmName: "Harrykis Helebati", nmPhone: "+265888469925", lat: -14.0076017, lng: 33.5397983 },
  mkombe: { id: "mkombe", name: "Mkombe", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19702", potfillingTarget: 8100, nmName: "Bezayi Ndelema", nmPhone: "+265884835530", lat: -14.0081467, lng: 33.5325117 },
  ntandula: { id: "ntandula", name: "Ntandula", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19703", potfillingTarget: 11750, nmName: "Paulo Dena", nmPhone: "+265886923227", lat: -14.0171917, lng: 33.5319633 },
  kuchata: { id: "kuchata", name: "Kuchata", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19704", potfillingTarget: 8750, nmName: "Gaven Simbi", nmPhone: "+265896535295", lat: -14.0101724, lng: 33.6125814 },
  mpombe: { id: "mpombe", name: "Mpombe", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19705", potfillingTarget: 13250, nmName: "Kazimu Molosi", nmPhone: "+265885295479", lat: -13.9670593, lng: 33.5929222 },
  sinda: { id: "sinda", name: "Sinda", epa: "Mpingu", assistant: "Prince Mkumbwa", nurseryId: "LLMP19706", potfillingTarget: 8350, nmName: "Davie Chipanthenga", nmPhone: "+265892129092", lat: -13.9709217, lng: 33.5804817 },
  "n-a": { id: "n-a", name: "N/A", epa: "Office", assistant: "N/A", nurseryId: "", potfillingTarget: null, nmName: "", nmPhone: "", lat: null, lng: null },
};

/* ---- Default check-in schedule, used only if no legacy `visits`
   collection is found in this project ---- */
const LEGACY_SEED_VISITS = [{"order": 0, "week": 1, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Kango", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 1, "week": 1, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Mtolongo", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 2, "week": 1, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Kafunde", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 3, "week": 1, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Likanga", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 4, "week": 1, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Masula", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 5, "week": 1, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Palawo", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 6, "week": 1, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Alfred Golowa", "site": "Sinumbe", "purpose": "Routine Audit & Seedling Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 7, "week": 1, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Kanyoni", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 8, "week": 1, "day": "Wednesday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Chilinda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 9, "week": 1, "day": "Wednesday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Chimsolo", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 10, "week": 1, "day": "Wednesday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Chishasha", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 11, "week": 1, "day": "Wednesday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Mkanda-Aloni", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 12, "week": 1, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Lundu", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 13, "week": 1, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Chamkondo", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 14, "week": 1, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Mpakiza", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 15, "week": 1, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Mwaza", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 16, "week": 1, "day": "Friday", "date": "", "epa": "Office", "assistant": "N/A", "site": "N/A", "purpose": "Weekly Reporting & Office Admin", "checklist": "Submit weekly report to DS/Manager; Team check-ins", "status": "Pending", "notes": ""}, {"order": 17, "week": 2, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Kanyambwe", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 18, "week": 2, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Zambo", "purpose": "Data Integrity & Progress Check", "checklist": "Physical pot count vs reported status", "status": "Pending", "notes": ""}, {"order": 19, "week": 2, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Katakungwa", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 20, "week": 2, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Mngongonda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 21, "week": 2, "day": "Tuesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Bingu", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 22, "week": 2, "day": "Tuesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Chalenya", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 23, "week": 2, "day": "Tuesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Kanongona", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 24, "week": 2, "day": "Tuesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Ndelendele", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 25, "week": 2, "day": "Wednesday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Nkhwangwa", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 26, "week": 2, "day": "Wednesday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Kanjawala", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 27, "week": 2, "day": "Wednesday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Santhe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 28, "week": 2, "day": "Wednesday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Khanda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 29, "week": 2, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Mpingo", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 30, "week": 2, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Davie James", "site": "Muyala", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 31, "week": 2, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Chimwala", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 32, "week": 2, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Chisikwa Caleb", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 33, "week": 2, "day": "Friday", "date": "", "epa": "Office", "assistant": "N/A", "site": "N/A", "purpose": "Weekly Reporting & Office Admin", "checklist": "Submit weekly report to DS/Manager; Team check-ins", "status": "Pending", "notes": ""}, {"order": 34, "week": 3, "day": "Monday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Mniu", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 35, "week": 3, "day": "Monday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Kalasang'anga", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 36, "week": 3, "day": "Monday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Kombe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 37, "week": 3, "day": "Monday", "date": "", "epa": "Ming'ongo", "assistant": "Aubrey Kuyacha", "site": "Kudziwe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 38, "week": 3, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Dambo", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 39, "week": 3, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Dzoole", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 40, "week": 3, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Ngalazuka", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 41, "week": 3, "day": "Tuesday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Kadyaudzu", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 42, "week": 3, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Ndoliro", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 43, "week": 3, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Martha Jacob", "site": "Mkanda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 44, "week": 3, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Kamkundi", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 45, "week": 3, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Mkombe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 46, "week": 3, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Honest Gondwe", "site": "Nyemba", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 47, "week": 3, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Chibungo", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 48, "week": 3, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Kabwana", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 49, "week": 3, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Phulamazira", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 50, "week": 3, "day": "Friday", "date": "", "epa": "Office", "assistant": "N/A", "site": "N/A", "purpose": "Weekly Reporting & Office Admin", "checklist": "Submit weekly report to DS/Manager; Team check-ins", "status": "Pending", "notes": ""}, {"order": 51, "week": 4, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Mnjeza 2", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 52, "week": 4, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Mzungu", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 53, "week": 4, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Songole", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 54, "week": 4, "day": "Monday", "date": "", "epa": "Chilaza", "assistant": "Richard Lipenga", "site": "Zindo", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 55, "week": 4, "day": "Tuesday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Mbwemba", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 56, "week": 4, "day": "Tuesday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Mdondwe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 57, "week": 4, "day": "Tuesday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Madetsa", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 58, "week": 4, "day": "Tuesday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Mandala", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 59, "week": 4, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Ntandula", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 60, "week": 4, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Kuchata", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 61, "week": 4, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Mpombe", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 62, "week": 4, "day": "Wednesday", "date": "", "epa": "Mpingu", "assistant": "Prince Mkumbwa", "site": "Sinda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 63, "week": 4, "day": "Thursday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Mchepa", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 64, "week": 4, "day": "Thursday", "date": "", "epa": "Ming'ongo", "assistant": "Tadala Mphwina", "site": "Mphunda", "purpose": "Routine Audit & Nursery Management", "checklist": "Potfilling count; Seedling health; NM attendance", "status": "Pending", "notes": ""}, {"order": 65, "week": 4, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Chamkondo (Re-visit)", "purpose": "Data Integrity Follow-up", "checklist": "Verify resolved potfilling gap & updated logs", "status": "Pending", "notes": ""}, {"order": 66, "week": 4, "day": "Thursday", "date": "", "epa": "Chilaza", "assistant": "Austin Bonongwe", "site": "Mpakiza (Re-visit)", "purpose": "Data Integrity Follow-up", "checklist": "Verify resolved potfilling gap & updated logs", "status": "Pending", "notes": ""}, {"order": 67, "week": 4, "day": "Friday", "date": "", "epa": "Office", "assistant": "N/A", "site": "N/A", "purpose": "Weekly Reporting & Office Admin", "checklist": "Submit weekly report to DS/Manager; Team check-ins", "status": "Pending", "notes": ""}];

/* ---- Must match the PURPOSE_CHECKLIST in index.html ---- */
const PURPOSE_CHECKLIST = {"Routine Audit & Seedling Management": ["Potfilling count", "Seedling health", "NM attendance"], "Routine Audit & Nursery Management": ["Potfilling count", "Seedling health", "NM attendance"], "Data Integrity & Progress Check": ["Physical pot count vs reported status"], "Data Integrity Follow-up": ["Verify resolved potfilling gap", "Updated logs"], "Weekly Reporting & Office Admin": ["Submit weekly report to DS/Manager", "Team check-ins"]};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  console.log(`Upserting ${Object.keys(SITES_SEED).length} sites (safe to re-run any time you edit SITES_SEED)...`);
  let batch = db.batch();
  Object.values(SITES_SEED).forEach((s) => {
    batch.set(
      db.collection("sites").doc(s.id),
      { ...s, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
  console.log("Sites upserted.");

  const metaRef = db.doc("meta/schemaV2");
  const metaSnap = await metaRef.get();
  if (metaSnap.exists && metaSnap.data().done) {
    console.log("Check-in migration already done (meta/schemaV2.done = true). Nothing else to do.");
    return;
  }

  console.log("Checking for a legacy `visits` collection...");
  const legacySnap = await db.collection("visits").get();
  const sourceRows = legacySnap.empty
    ? LEGACY_SEED_VISITS.map((v, i) => ({ id: "seed" + i, ...v }))
    : legacySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(
    legacySnap.empty
      ? `No legacy visits found -- seeding ${sourceRows.length} check-ins from the default schedule.`
      : `Migrating ${sourceRows.length} legacy visit(s) into checkins...`
  );

  batch = db.batch();
  let opCount = 0;
  let migratedNotes = 0;
  for (const oldDoc of sourceRows) {
    const baseSiteName = (oldDoc.site || "").replace(/\s*\(Re-visit\)\s*$/, "");
    const siteId = slugify(baseSiteName || "N/A");
    const isRevisit = /\(Re-visit\)/.test(oldDoc.site || "");
    const items = PURPOSE_CHECKLIST[oldDoc.purpose] || (oldDoc.checklist ? [oldDoc.checklist] : []);

    const checkinRef = db.collection("checkins").doc(oldDoc.id);
    batch.set(checkinRef, {
      siteId, isRevisit,
      week: oldDoc.week, day: oldDoc.day, date: oldDoc.date || "",
      epa: oldDoc.epa, assistant: oldDoc.assistant, purpose: oldDoc.purpose,
      checklistItems: items, checkedItems: items.map(() => false),
      status: oldDoc.status || "Pending", order: oldDoc.order ?? 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    opCount++;

    if (oldDoc.notes && oldDoc.notes.trim()) {
      const obsRef = db.collection("observations").doc();
      batch.set(obsRef, {
        siteId, checkinId: oldDoc.id, type: "observation",
        text: oldDoc.notes.trim(), author: "Imported from previous version",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opCount++; migratedNotes++;
    }
    if (opCount >= 400) { await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if (opCount > 0) await batch.commit();

  await metaRef.set({
    done: true,
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    count: sourceRows.length,
    migratedNotes,
  });
  console.log("Done. meta/schemaV2.done = true.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
