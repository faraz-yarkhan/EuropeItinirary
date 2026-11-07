# Weekly data refresh

The planner's facts go stale: exchange rates move, entry rules change, flights, prices and timetables
change, restaurants and hotels open and close. Once a week a scheduled Claude session follows this checklist.

## Ground rules
- Work on branch `claude/gallant-allen-8hqn4y` only (pull it first). Never force-push. Don't open pull requests.
- Change **data and wording**, not design. Don't restructure code.
- Where things live:
  - `data.js` — `DATA_INFO` (refresh date), `FX` (exchange rates), `COUNTRIES`, `REGIONS` (entry rules outside Schengen)
  - `cities-*.js` — each city's places, halal food, mosques, cafés, Instagram spots, dishes, transport tips
  - `hotels.js` — the three hotel picks per city (name, area, coordinates, typical nightly price, note)
  - `climate.js` — monthly climate averages per city (stable; only fix errors, no weekly check needed)
  - `routes.js` — `ROUTES` (intercity advice; the **first sentence** names the recommended mode and
    "about X h Y" is read as the ride time), `BOATS`, `BEST`, `SYD_FLIGHTS`
  - `app.js` — some facts are written in text (visa notes, Before you go, money tips). Search before editing.
- Every change must be backed by a current source (official sites first, then reputable travel or booking
  sites, then recent reviews). If sources disagree or you can't verify something, leave it and note it in the
  log. **Never invent places, prices, ratings or coordinates.**
- Keep the JavaScript working on older iPhones: no `??`, `?.`, regex lookbehind `(?<=`, `flatMap`, `.flat(`,
  `replaceAll`, `.at(`.
- Small, careful changes beat big rewrites. With 56 cities you can't recheck everything every week:
  do items 1–4 every week, and rotate items 5–9 through the cities (about 8–10 cities a week, continuing
  from where the last log entry stopped), so every city is reviewed roughly every 6 weeks.

## Checklist
1. **Exchange rates** (ECB euro reference rates, XE, Wise): update `FX.eurAud` (A$ per €1, mid-market) and
   `FX.perEur` (units per €1) in `data.js`, and the comment above it (date and sources). BAM is fixed at 1.95583.
2. **Entry rules for Australians** (smartraveller.gov.au, travel-europe.europa.eu, gov.uk):
   - Schengen 90/180 and the Entry/Exit System; **ETIAS** start date (last known: expected 2027) — search
     `ETIAS` in `app.js`.
   - UK ETA fee and rules (last known £20 since April 2026) — search `ETA` in `app.js`.
   - Türkiye visa-free for Australians since 17 Apr 2026 — search `Türkiye` in `app.js`.
   - `REGIONS` in `data.js` (Ireland, Bosnia, Serbia, Montenegro, Albania, North Macedonia, Russia) and the
     Smartraveller level for Russia (`COUNTRIES.ru.warn`, last known "Do not travel").
3. **Flights from Sydney** (`SYD_FLIGHTS`, `SYD_HUBS` in `routes.js`): one-stop carriers still flying; the
   Qantas Sydney–London nonstop (announced for October 2027) — search `October 2027`.
4. **City fees and big-ticket prices**: Louvre, Vatican, Colosseum, Sagrada Família, Alhambra, Acropolis,
   Venice access fee dates, Trevi Fountain fee, UK/EU tourist taxes — update the `c` (cost), `cl` (closed days)
   and `tip` fields.
5. **Places** (`CITIES[...].places`, rotating cities): ticket prices, closing days, booking rules, closures,
   renovations (e.g. Pergamon Museum partly reopens 4 June 2027).
6. **Hotels** (`hotels.js`, rotating cities): still operating, names unchanged, typical prices; keep three picks
   per city with consistently good reviews. Replace a closed or poorly reviewed hotel with a verified one
   (name, area, coordinates, price range, note).
7. **Halal food & mosques** (`halal`, `mosques`, rotating cities): still open (recent reviews), addresses.
   Remove or replace closed ones; add well-reviewed new halal places when found.
8. **Cafés & Instagram spots** (`cafes`, `insta`, rotating cities): still open / accessible, fees (e.g. the
   Iseltwald pier fee), best times.
9. **Intercity routes** (`ROUTES`, `BOATS`, rotating cities): typical times and fares, new lines (e.g.
   Budapest–Belgrade high-speed passenger trains, last known "due to start" — search `high-speed line`).

## Finish
1. Set `DATA_INFO.refreshed` in `data.js` to today's date (YYYY-MM-DD) — even if nothing else changed.
2. `python3 tools/build.py` — updates the footer date and rebuilds `europe-trip-planner.html`.
3. `node tools/smoke-test.js` — every line must say PASS. Fix anything you broke; if you can't, don't push.
4. Add an entry at the top of `tools/refresh-log.md`: date, what changed, sources, which cities were reviewed,
   anything unverified, and where the city rotation stopped.
5. Commit (`Weekly data refresh YYYY-MM-DD`) and push to `claude/gallant-allen-8hqn4y`.
   GitHub Pages (if enabled) updates from this branch automatically.
6. End with a short summary for the owner: what changed this week (especially exchange rates, ETIAS, the UK ETA,
   Türkiye and Russia advice), and anything that needs their attention.
