// Generiše statične ICS fajlove u public/ za GitHub Pages.
// Pokreće se iz GitHub Actions na svakih sat vremena (i pri svakom push-u).

const fs = require("fs");
const path = require("path");
const { filterIcs } = require("../api/urnik.js");

const LETNIK = process.env.LETNIK || "50"; // Biotehnologija 1. letnik (BTUN)
const REMINDER = parseInt(process.env.OPOMNIK || "60", 10);
const OUT = path.join(__dirname, "..", "public");

const SOURCE = `https://urniki.bf.uni-lj.si/layer_one/${LETNIK}/?export=1&types=standard%2Cspecial%2Creservation`;

async function main() {
  const res = await fetch(SOURCE, { headers: { "User-Agent": "bf-urnik-build/1.0" } });
  if (!res.ok) throw new Error(`Izvor vratio ${res.status}`);
  const src = await res.text();
  if (!src.includes("BEGIN:VCALENDAR")) throw new Error("Izvor nije vratio ICS");

  fs.mkdirSync(OUT, { recursive: true });

  const variants = [{ name: "sve", skupina: "" }];
  for (const g of ["1", "2", "3", "4", "5"]) {
    // bez izbora fizike: zadrži i A i B
    variants.push({ name: `skupina-${g}`, skupina: `${g},A,B` });
    for (const f of ["A", "B"]) variants.push({ name: `skupina-${g}-${f}`, skupina: `${g},${f}` });
  }

  const report = [];
  for (const v of variants) {
    const { ics, stats } = filterIcs(src, { skupina: v.skupina, opomnik: REMINDER });
    fs.writeFileSync(path.join(OUT, `${v.name}.ics`), ics);
    const kept = stats.total - stats.groupDropped - stats.subjectDropped - stats.dateDropped;
    report.push({ file: `${v.name}.ics`, termina: kept });
  }

  fs.copyFileSync(path.join(__dirname, "..", "index.html"), path.join(OUT, "index.html"));
  fs.writeFileSync(
    path.join(OUT, "status.json"),
    JSON.stringify({ generisano: new Date().toISOString(), letnik: LETNIK, fajlovi: report }, null, 2)
  );
  console.table(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
