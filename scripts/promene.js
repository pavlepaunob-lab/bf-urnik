// Poredi trenutni public/sve.ics sa nedeljnim snapshot-om (snapshot/sve.ics)
// i piše public/promene.json (dodati / uklonjeni termini od poslednjeg snapshota).
// Ako je počela nova ISO nedelja (ili snapshot ne postoji), osvežava snapshot
// i ispisuje "SNAPSHOT_UPDATED" da workflow zna da treba da commituje.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CURRENT = path.join(ROOT, "public", "sve.ics");
const SNAP_DIR = path.join(ROOT, "snapshot");
const SNAP = path.join(SNAP_DIR, "sve.ics");
const WEEK_FILE = path.join(SNAP_DIR, "week.txt");
const OUT = path.join(ROOT, "public", "promene.json");

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

function events(ics) {
  const text = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const map = new Map();
  for (const ev of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
    const get = (n) => (ev.match(new RegExp(`^${n}(?:;[^:]*)?:(.*)$`, "m")) || [])[1] || "";
    const un = (s) => s.replace(/\\,/g, ",").replace(/\\n/gi, " ");
    const e = {
      naziv: un(get("SUMMARY")),
      pocetak: get("DTSTART").replace(/[^0-9T]/g, ""),
      kraj: get("DTEND").replace(/[^0-9T]/g, ""),
      prostor: un(get("LOCATION")),
    };
    map.set(`${e.naziv}|${e.pocetak}|${e.kraj}|${e.prostor}`, e);
  }
  return map;
}

function fmt(s) {
  // 20261005T100000 -> 05.10.2026 10:00
  return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)} ${s.slice(9, 11)}:${s.slice(11, 13)}`;
}

const current = fs.readFileSync(CURRENT, "utf8");
fs.mkdirSync(SNAP_DIR, { recursive: true });

const week = isoWeek(new Date());
const prevWeek = fs.existsSync(WEEK_FILE) ? fs.readFileSync(WEEK_FILE, "utf8").trim() : "";
let snapshotUpdated = false;

if (!fs.existsSync(SNAP) || prevWeek !== week) {
  fs.writeFileSync(SNAP, current);
  fs.writeFileSync(WEEK_FILE, week + "\n");
  snapshotUpdated = true;
}

const now = events(current);
const old = events(fs.readFileSync(SNAP, "utf8"));
const dodato = [...now.keys()].filter((k) => !old.has(k)).map((k) => now.get(k));
const uklonjeno = [...old.keys()].filter((k) => !now.has(k)).map((k) => old.get(k));
const pretty = (e) => ({ ...e, pocetak: fmt(e.pocetak), kraj: fmt(e.kraj) });

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      nedelja: week,
      snapshotOsvezen: snapshotUpdated,
      dodato: dodato.map(pretty),
      uklonjeno: uklonjeno.map(pretty),
    },
    null,
    2
  )
);

console.log(`nedelja ${week}; dodato ${dodato.length}, uklonjeno ${uklonjeno.length}, snapshot ${snapshotUpdated ? "osvežen" : "isti"}`);
if (snapshotUpdated) console.log("SNAPSHOT_UPDATED");
