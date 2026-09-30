# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Phone-subscribable calendar for the UL Biotechnical Faculty timetable of *Biotehnologija 1. letnik (BTUN)*, `https://urniki.bf.uni-lj.si/layer_one/50/`. The faculty site already exports ICS (`?export=1&types=standard,special,reservation`, optional `&include_cancelled=1`) but contains every lab group. This repo re-publishes that export filtered to one group, with a 60-minute reminder, at `https://pavlepaunob-lab.github.io/bf-urnik/` (GitHub Pages, repo `pavlepaunob-lab/bf-urnik`, public).

The owner (Pavle Paunov) is in **skupina 3**; physics A/B group unknown. Communicate in Serbian.

## Commands

```
npm run build            # node scripts/build.js  -> fetches the source ICS, writes public/*.ics + status.json
node scripts/promene.js  # diff public/sve.ics vs snapshot/sve.ics -> public/promene.json (needs build first)
```

No tests, no lint, no dependencies (Node ≥ 22 for global `fetch`; CI uses Node 22). `public/` is gitignored build output; open `public/index.html` locally to check the page. Ad-hoc check of the filter without network:

```
node -e "const {filterIcs}=require('./api/urnik.js');const r=filterIcs(require('fs').readFileSync('public/sve.ics','utf8'),{skupina:'3,A,B',opomnik:15});console.log(r.stats,r.calName)"
```

Deploy = push to `main`. `.github/workflows/build.yml` runs on push, hourly (`17 * * * *`) and manually; it builds, diffs, and deploys `public/` with `actions/deploy-pages`. Pages is configured with `build_type=workflow`.

## Architecture

One filter, two delivery paths:

- `api/urnik.js` holds the whole filtering logic in `filterIcs(ics, opts)` (exported) and is *also* a Vercel serverless handler (query params `letnik`, `skupina`, `predmeti`, `opomnik`, `od`, `otkazani`; `vercel.json` rewrites `/urnik.ics` to it). The Vercel path is **not deployed** (Vercel MCP lacks project-create permission, CLI not logged in); it exists so `vercel --prod` works if a dynamic feed is ever needed. Keep it and the static build in sync by changing only `filterIcs`.
- `scripts/build.js` is the static path used in production: calls `filterIcs` for a fixed matrix of variants (`sve`, `skupina-1..5`, `skupina-N-A|B`) and copies `index.html` into `public/`. `skupina-N` (no physics choice) passes `N,A,B` so both physics groups stay.

How `filterIcs` decides what to keep, in order: drop events starting before the academic year start (Sept 1 of the current academic year, unless `od` given); drop events whose SUMMARY carries a group tag `[:X]` not in `skupina` (events without a tag such as lectures, exams and reservations always stay); optionally drop subjects by `(BTnnn)` code; append a `VALARM` if `opomnik > 0`. Group tags: `[:1]`–`[:5]` for labs, `[:A]`/`[:B]` only for *Izbrana poglavja iz fizike*. The calendar name becomes `BF Urnik - skupina N` (A/B omitted when both present). Lines are unfolded on input and re-folded to 74 bytes on output; `SOURCE`/`URL` headers are stripped so clients don't re-subscribe to the unfiltered origin.

`scripts/promene.js` + `snapshot/`: each run diffs the current full export against `snapshot/sve.ics` (key = summary|start|end|location) into `public/promene.json`, which `index.html` renders as an added/removed list. When a new ISO week starts the script refreshes the snapshot and prints `SNAPSHOT_UPDATED`; the workflow then commits `snapshot/` as `github-actions[bot]`. That weekly commit is deliberate: GitHub disables scheduled workflows after 60 days without repository activity. Bot pushes with `GITHUB_TOKEN` don't retrigger the workflow.

`index.html` is plain HTML/JS, no build step; it derives file names from the two selects (`skupina-<sk>[-<fz>].ics`, else `sve.ics`), builds `webcal://` and Google Calendar (`calendar/r?cid=`) links relative to its own URL, remembers the choice in `localStorage`, and shows `status.json` / `promene.json`. Default selection is skupina 3.

## Known data caveats

- The timetable is generic weekly slots; the faculty's PDF lab schedule (Kemija, 29 Sep 2026) lists 11 lab dates for group 3 and the timetable has 3 extra (5.10., 14.10., 28.10.). Nothing is overridden locally; the source is authoritative.
- Google Calendar ignores `VALARM` in subscribed calendars and refreshes every 12–24 h; iOS honours alarms only with "Remove Alerts" off. The page's instructions reflect this, keep them accurate if reminder behaviour changes.
