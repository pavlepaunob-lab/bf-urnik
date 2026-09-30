# bf-urnik

Kalendar za telefon iz urnika https://urniki.bf.uni-lj.si/layer_one/50/ (Biotehnologija 1. letnik, BTUN).

- `scripts/build.js` — skida zvanični ICS izvoz sa sajta, izbacuje termine drugih grupa za vaje,
  dodaje podsetnik 15 min pre i piše statične fajlove u `public/` (`sve.ics`, `skupina-N.ics`, `skupina-N-A|B.ics`).
- `.github/workflows/build.yml` — GitHub Actions: pri push-u i svakog sata regeneriše fajlove i objavljuje ih na GitHub Pages.
- `index.html` — stranica za izbor grupe i pretplatu (webcal / Google Calendar).
- `api/urnik.js` — ista logika kao Vercel funkcija sa query parametrima (`skupina`, `predmeti`, `opomnik`, `od`, `otkazani`);
  deploy sa `vercel --prod` ako nekad zatreba dinamički feed.

Lokalno: `npm run build` pa otvori `public/index.html`.
