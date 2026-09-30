// Filtrirani ICS feed za UL BF urnik (urniki.bf.uni-lj.si).
// Parametri (query):
//   letnik   - id "layer_one" na sajtu (podrazumevano 50 = Biotehnologija 1. letnik BTUN)
//   skupina  - oznake grupa koje se zadržavaju, npr. "2" ili "2,A" (događaji bez oznake grupe ostaju uvek)
//   predmeti - šifre predmeta, npr. "BT001,BT002" (ako je zadato, ostali predmeti sa šifrom se izbacuju)
//   opomnik  - podsetnik u minutima pre početka (podrazumevano 60; 0 = bez podsetnika)
//   od       - najraniji datum YYYY-MM-DD (podrazumevano početak tekuće akademske godine, 1. 9.)
//   otkazani - 1 = uključi i otkazane termine (podrazumevano 0)

const SOURCE = "https://urniki.bf.uni-lj.si";

function academicYearStart(now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 9 ? `${y}0901` : `${y - 1}0901`;
}

function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function fold(line) {
  // RFC 5545: max 75 okteta po liniji; folduj po znakovima (dovoljno dobro za UTF-8 kraće linije)
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, "utf8") > 74) {
    let cut = 74;
    while (Buffer.byteLength(s.slice(0, cut), "utf8") > 74) cut--;
    out.push(s.slice(0, cut));
    s = " " + s.slice(cut);
  }
  out.push(s);
  return out.join("\r\n");
}

function prop(block, name) {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m");
  const m = block.match(re);
  return m ? m[1] : "";
}

function unescapeIcs(s) {
  return s.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, "\n").replace(/\\\\/g, "\\");
}

function parseList(v) {
  return String(v || "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function filterIcs(ics, opts) {
  const text = unfold(ics);
  const lines = text.split("\n");
  const head = [];
  const events = [];
  let cur = null;
  let inEvent = false;
  const tail = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = [line];
      continue;
    }
    if (line === "END:VEVENT") {
      cur.push(line);
      events.push(cur.join("\n"));
      cur = null;
      inEvent = false;
      continue;
    }
    if (inEvent) cur.push(line);
    else if (line === "END:VCALENDAR") tail.push(line);
    else head.push(line);
  }

  const groups = new Set(parseList(opts.skupina));
  const subjects = new Set(parseList(opts.predmeti));
  const from = opts.od ? opts.od.replace(/-/g, "") : academicYearStart(new Date());
  const reminder = Number.isFinite(opts.opomnik) ? opts.opomnik : 60;

  const kept = [];
  const stats = { total: events.length, groupDropped: 0, subjectDropped: 0, dateDropped: 0 };

  for (const ev of events) {
    const summary = unescapeIcs(prop(ev, "SUMMARY"));
    const start = prop(ev, "DTSTART").replace(/[^0-9]/g, "").slice(0, 8);

    if (start && start < from) {
      stats.dateDropped++;
      continue;
    }

    const tag = summary.match(/\[:([^\]]+)\]/);
    if (tag && groups.size && !groups.has(tag[1].trim().toUpperCase())) {
      stats.groupDropped++;
      continue;
    }

    const code = summary.match(/\((BT\d{3})\)/);
    if (code && subjects.size && !subjects.has(code[1].toUpperCase())) {
      stats.subjectDropped++;
      continue;
    }

    let out = ev;
    if (reminder > 0) {
      const alarm = [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${prop(ev, "SUMMARY")}`,
        `TRIGGER:-PT${reminder}M`,
        "END:VALARM",
      ].join("\n");
      out = ev.replace(/\nEND:VEVENT$/, `\n${alarm}\nEND:VEVENT`);
    }
    kept.push(out);
  }

  const shown = groups.has("A") && groups.has("B") ? [...groups].filter((g) => g !== "A" && g !== "B") : [...groups];
  const label = shown.length ? ` - skupina ${shown.join("/")}` : "";
  const calName = `BF Urnik${label}`;
  const newHead = head
    .filter((l) => !/^(SOURCE|URL|NAME|X-WR-CALNAME)(;|:)/.test(l))
    .map((l) => (l === "BEGIN:VCALENDAR" ? `${l}\nNAME:${calName}\nX-WR-CALNAME:${calName}` : l));

  const body = [...newHead, ...kept, ...tail].join("\n");
  const folded = body
    .split("\n")
    .map(fold)
    .join("\r\n");
  return { ics: folded + "\r\n", stats, calName };
}

async function fetchSource(letnik, otkazani) {
  const types = "standard,special,reservation";
  const url = `${SOURCE}/layer_one/${letnik}/?export=1&types=${encodeURIComponent(types)}${otkazani ? "&include_cancelled=1" : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": "bf-urnik-filter/1.0" } });
  if (!res.ok) throw new Error(`Izvor vratio ${res.status}`);
  return res.text();
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const letnik = String(q.letnik || "50").replace(/[^0-9]/g, "") || "50";
    const opts = {
      skupina: q.skupina || "",
      predmeti: q.predmeti || "",
      opomnik: q.opomnik !== undefined ? parseInt(q.opomnik, 10) : 60,
      od: /^\d{4}-\d{2}-\d{2}$/.test(q.od || "") ? q.od : "",
    };
    const src = await fetchSource(letnik, q.otkazani === "1");
    const { ics, stats, calName } = filterIcs(src, opts);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="bf-urnik.ics"`);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    res.setHeader("X-Urnik-Stats", JSON.stringify(stats));
    res.setHeader("X-Urnik-Calendar", calName);
    res.status(200).send(ics);
  } catch (err) {
    res.status(502).send(`Greška pri preuzimanju urnika: ${err.message}`);
  }
};

module.exports.filterIcs = filterIcs;
