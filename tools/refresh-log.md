# Data refresh log

Newest first. Each daily refresh adds an entry (see `tools/REFRESH.md`).

## 2026-11-09
- Exchange rates: €1 ≈ A$1.62 (XE 1.6215, Wise 1.621, Bloomberg 1.621 on 9 Nov; was 1.60). Per €1, ECB reference
  rates of 9 Nov: GBP 0.834, CHF 0.916, CZK 24.37, DKK 7.475, HUF 363.0, PLN 4.38, RON 5.34, NOK 10.53 (was 11.26),
  ISK 136.8 (was 144), TRY 56.1 (was 53.5). SEK 11.01 (market, 9 Nov), RSD 117.6 (NBS middle rate 9 Nov), MKD 61.5 (XE
  9 Nov), ALL 90.6 (market 5 Nov; was 98), RUB 91.3 (market 8 Nov; ECB suspended its rouble rate). All mid-2026 values now replaced.
- Entry rules: ETIAS still has no official start date (Commission dropped the Q4 2026 target; ABTA 13 Oct: "no official
  launch date") — app wording changed from "now expected in 2027" to "no new start date announced (widely expected in 2027)"
  in Before you go. UK ETA £20 confirmed by several 2026 sources (GOV.UK page itself not retrieved). Türkiye visa-free for
  Australians, 90 days in 180, since 17 Apr 2026 — now confirmed on Smartraveller. Russia: Smartraveller page snippet not
  conclusive; secondary sources still say "Do not travel" — left unchanged.
- Flights: Qantas Sydney–London nonstop still October 2027 (announced June 2026; sales open Feb 2027). No change.
- Budapest–Belgrade high-speed line: still no passenger service confirmed (Hungarian side testing) — no change.
  Venice 2027 access-fee dates (press: 72 days, 26 Mar – 15 Aug 2027) not yet on cda.veneziaunica.it — no change.
- Edinburgh 5% visitor levy (since 24 Jul 2026, first 5 nights) added to the City fees line in app.js (edinburgh.gov.uk, VisitScotland).
- Cities reviewed: **London** — bus fare £1.75 → £1.85 from 1 Nov 2026 (london.gov.uk fares paper); Tower of London
  ~£35 → ~£38 (hrp.org.uk); Westminster Abbey ~£30 → ~£32 (westminster-abbey.org); London Eye "from ~£29 online"
  (londoneye.com); WB Studio Tour ~£55 → ~£58 (2026 guides citing wbstudiotour.co.uk); Windsor £32 and Tue/Wed closures
  confirmed; Zones 1–2 cap £8.90 confirmed. Tayyabs, Lahore Kebab House: open (2026 reviews). Hyatt Regency The Churchill
  operating. **Edinburgh** — Castle ~£21 → ~£23.50 online (Oct 2026, citing edinburghcastle.scot); Holyroodhouse
  ~£21 → ~£22 online (rct.uk); airport tram £7.90 (fare frozen 2026), city tram £2.40; Elephant House reopened Dec 2025
  (note updated); Mosque Kitchen and Kebab Mahal open (2026 reviews); Radisson Collection Royal Mile well rated.
  Route lon|edi: added fastest ~4 h 05 and Lumo from ~£20.
- Unverified / left as is: Maroush (Edgware Road) — one listing says the original branch closed permanently, others list
  Maroush Deli/Express on Edgware Road; check next time. Real Mary King's Close price (sources say £21–25). Lothian bus
  single fare. Hotel prices for London/Edinburgh not re-checked against live rates.
- Rotation stopped after: lon, edi. Next: par, nce.

## 2026-11-05 — baseline
- Exchange rates: €1 ≈ A$1.60 (ECB-based 1.606, Wise 1.603, MTFX 1.602 on 4 Nov 2026; was 1.64 from mid-2026).
  Per €1 from the ECB reference rates of 3–4 Nov 2026: GBP 0.834, CHF 0.919, CZK 24.34, DKK 7.47, HUF 364.4,
  PLN 4.42, RON 5.34. **Not re-verified (still mid-2026 values):** SEK 11.07, NOK 11.26, ISK 144, RSD 117.2,
  MKD 61.6, ALL 98, TRY 53.5, RUB 92 — check these first next week.
- Entry rules (checked 2–3 Nov 2026): EES fully live since 10 Apr 2026; ETIAS not running, now expected 2027;
  UK ETA £20 since 8 Apr 2026 (secondary sources — confirm on GOV.UK); Türkiye visa-free for Australians since
  17 Apr 2026 (secondary sources — confirm on Smartraveller); Russia: Smartraveller "Do not travel"; Australians
  not eligible for Russia's e-visa; Bulgaria on the euro since 1 Jan 2026.
- Prices checked: Louvre €32 for non-EEA visitors (from 14 Jan 2026); Trevi Fountain basin €2 (from 2 Feb 2026);
  Acropolis €30 (Apr–Oct); Sagrada Família ~€26 / €36 with towers; Venice access fee ran 3 Apr – 26 Jul 2026.
- Flights: no Sydney–Europe nonstop; Qantas Sydney–London nonstop announced for October 2027.
- Pergamon Museum (Berlin) partly reopens 4 June 2027. Budapest–Belgrade high-speed passenger service not
  confirmed running.
- Hotel picks (168) and coordinates are from the initial build and approximate (within a block or two);
  ratings not individually re-checked yet.
- City rotation for items 5–9 starts next week with: lon, edi, par, nce, ams, bru, ber, muc, zrh (order of the
  `cities-*.js` files).
