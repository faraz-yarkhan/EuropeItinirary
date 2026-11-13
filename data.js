/* Destination database for the Europe Trip Planner — core definitions.
   City data lives in cities-*.js; intercity routes and Sydney flights in routes.js.
   Prices are approximate (2025–26) and in local currency. Coordinates are approximate and
   only used to estimate distances, travel times and the nearest halal food, cafés and photo spots.
   Place fields: n name, loc local name, t tags, s slots (m morning, e afternoon, n evening,
   full = whole day), h time needed, c cost, m nearest metro/tram stop, ll [lat,lng], d description,
   tip, x how to get there when it is outside town (day trip), cl closed weekdays (0 Sun … 6 Sat),
   r rating 1–3 (3 = unmissable).
   City extras: cafes [{n, ll, note}] — coffee, cake and dessert stops;
   insta [{n, ll, note, when}] — Instagram-worthy spots and the best time to shoot them;
   nightsRec — the number of nights we recommend; rail — rail network group (null = no useful railway);
   island — reached only by air or sea. */

/* ---------- DATA REFRESH — updated by the daily refresh (see tools/REFRESH.md) ---------- */
const DATA_INFO = {
  refreshed: "2026-11-13", // date the data was last checked (YYYY-MM-DD)
  covers: "exchange rates, entry rules for Australians, Sydney flights, prices, opening days, hotels, halal food and transport",
};
/* Exchange rates: eurAud = A$ per €1 (mid-market); perEur = units of each currency per €1 (ECB reference rates).
   Everything converts through the euro. Checked 2026-11-12: EUR/AUD ≈ 1.62 (XE 1.624, Telexoo 1.624 on 12 Nov);
   GBP, CHF from the ECB reference rates of 12 Nov; CZK, DKK, ISK, PLN, SEK, NOK from the ECB rates of 10 Nov; HUF, RON, TRY from the ECB rates of 9 Nov;
   RSD = National Bank of Serbia middle rate 9 Nov; MKD from XE 9 Nov; ALL from market rates 5 Nov; RUB from market rates
   8 Nov (the ECB no longer publishes a rouble rate). */
const FX = {
  eurAud: 1.62,
  perEur: { EUR: 1, GBP: 0.836, CHF: 0.923, CZK: 24.34, HUF: 363.0, PLN: 4.39, DKK: 7.475, SEK: 10.99, NOK: 10.62, ISK: 137.2, RON: 5.34,
    RSD: 117.6, MKD: 61.5, ALL: 90.6, BAM: 1.95583, TRY: 56.1, RUB: 91.3 },
};
const CUR_CODE = { gb: "GBP", ch: "CHF", cz: "CZK", hu: "HUF", pl: "PLN", dk: "DKK", se: "SEK", no: "NOK", is: "ISK", ro: "RON",
  rs: "RSD", mk: "MKD", al: "ALL", ba: "BAM", tr: "TRY", ru: "RUB" };

const TRIP_TYPES = [
  { id: "sightseeing", label: "Sightseeing" },
  { id: "culture", label: "Culture & history", tags: ["culture", "history"] },
  { id: "food", label: "Food & cafés", tags: ["food"] },
  { id: "photo", label: "Instagram & photography", tags: ["photo"] },
  { id: "nature", label: "Nature & scenery", tags: ["nature"] },
  { id: "adventure", label: "Adventure" },
  { id: "islamic", label: "Islamic heritage", tags: ["islamic"] },
  { id: "relaxing", label: "Relaxing" },
  { id: "shopping", label: "Shopping" },
  { id: "family", label: "Family-friendly" },
];

/* Groups for the country picker */
const AREAS = [
  ["west", "Western Europe"], ["central", "Central Europe"], ["north", "Nordic & Baltic"],
  ["south", "Southern Europe"], ["balkans", "Balkans & South-East"], ["east", "Eastern Europe"],
];

/* region: border zone (passport checks happen between zones). lang: phrasebook language.
   ll: where to print the country's name on the route map. warn: shown prominently in the plan. */
const COUNTRIES = {
  gb: { area: "west", name: "United Kingdom", flag: "🇬🇧", region: "uk", cur: "£ (GBP)", lang: "en", ll: [52.6, -1.6] },
  ie: { area: "west", name: "Ireland", flag: "🇮🇪", region: "ie", cur: "€ (EUR)", lang: "en", ll: [53.1, -8.0] },
  fr: { area: "west", name: "France", flag: "🇫🇷", region: "schengen", cur: "€ (EUR)", lang: "fr", ll: [46.6, 2.4] },
  be: { area: "west", name: "Belgium", flag: "🇧🇪", region: "schengen", cur: "€ (EUR)", lang: "fr", ll: [50.5, 4.6] },
  nl: { area: "west", name: "Netherlands", flag: "🇳🇱", region: "schengen", cur: "€ (EUR)", lang: "nl", ll: [52.6, 5.6] },
  de: { area: "central", name: "Germany", flag: "🇩🇪", region: "schengen", cur: "€ (EUR)", lang: "de", ll: [51.0, 10.2] },
  ch: { area: "central", name: "Switzerland", flag: "🇨🇭", region: "schengen", cur: "CHF", lang: "de", ll: [46.85, 8.2] },
  at: { area: "central", name: "Austria", flag: "🇦🇹", region: "schengen", cur: "€ (EUR)", lang: "de", ll: [47.4, 14.2] },
  cz: { area: "central", name: "Czechia", flag: "🇨🇿", region: "schengen", cur: "Kč (CZK)", lang: "cs", ll: [49.8, 15.4] },
  sk: { area: "central", name: "Slovakia", flag: "🇸🇰", region: "schengen", cur: "€ (EUR)", lang: "sk", ll: [48.75, 19.6] },
  pl: { area: "central", name: "Poland", flag: "🇵🇱", region: "schengen", cur: "zł (PLN)", lang: "pl", ll: [52.0, 19.2] },
  hu: { area: "central", name: "Hungary", flag: "🇭🇺", region: "schengen", cur: "Ft (HUF)", lang: "hu", ll: [47.1, 19.3] },
  si: { area: "central", name: "Slovenia", flag: "🇸🇮", region: "schengen", cur: "€ (EUR)", lang: "sl", ll: [46.15, 14.6] },
  dk: { area: "north", name: "Denmark", flag: "🇩🇰", region: "schengen", cur: "kr (DKK)", lang: "da", ll: [56.1, 9.3] },
  se: { area: "north", name: "Sweden", flag: "🇸🇪", region: "schengen", cur: "kr (SEK)", lang: "sv", ll: [62.0, 15.5] },
  no: { area: "north", name: "Norway", flag: "🇳🇴", region: "schengen", cur: "kr (NOK)", lang: "no", ll: [61.5, 9.0] },
  fi: { area: "north", name: "Finland", flag: "🇫🇮", region: "schengen", cur: "€ (EUR)", lang: "fi", ll: [63.0, 26.0] },
  is: { area: "north", name: "Iceland", flag: "🇮🇸", region: "schengen", cur: "kr (ISK)", lang: "is", ll: [64.9, -18.6] },
  ee: { area: "north", name: "Estonia", flag: "🇪🇪", region: "schengen", cur: "€ (EUR)", lang: "et", ll: [58.7, 25.6] },
  lv: { area: "north", name: "Latvia", flag: "🇱🇻", region: "schengen", cur: "€ (EUR)", lang: "lv", ll: [56.9, 25.4] },
  lt: { area: "north", name: "Lithuania", flag: "🇱🇹", region: "schengen", cur: "€ (EUR)", lang: "lt", ll: [55.3, 23.9] },
  it: { area: "south", name: "Italy", flag: "🇮🇹", region: "schengen", cur: "€ (EUR)", lang: "it", ll: [42.9, 12.6] },
  es: { area: "south", name: "Spain", flag: "🇪🇸", region: "schengen", cur: "€ (EUR)", lang: "es", ll: [39.9, -3.6] },
  pt: { area: "south", name: "Portugal", flag: "🇵🇹", region: "schengen", cur: "€ (EUR)", lang: "pt", ll: [39.6, -8.0] },
  gr: { area: "south", name: "Greece", flag: "🇬🇷", region: "schengen", cur: "€ (EUR)", lang: "el", ll: [39.6, 21.9] },
  mt: { area: "south", name: "Malta", flag: "🇲🇹", region: "schengen", cur: "€ (EUR)", lang: "en", ll: [35.75, 14.4] },
  hr: { area: "balkans", name: "Croatia", flag: "🇭🇷", region: "schengen", cur: "€ (EUR)", lang: "hr", ll: [45.3, 15.8] },
  ba: { area: "balkans", name: "Bosnia & Herzegovina", flag: "🇧🇦", region: "ba", cur: "KM (BAM)", lang: "hr", ll: [44.2, 17.8] },
  rs: { area: "balkans", name: "Serbia", flag: "🇷🇸", region: "rs", cur: "din (RSD)", lang: "sr", ll: [43.9, 20.9] },
  me: { area: "balkans", name: "Montenegro", flag: "🇲🇪", region: "me", cur: "€ (EUR)", lang: "sr", ll: [42.8, 19.3] },
  al: { area: "balkans", name: "Albania", flag: "🇦🇱", region: "al", cur: "L (ALL)", lang: "sq", ll: [40.9, 20.1] },
  mk: { area: "balkans", name: "North Macedonia", flag: "🇲🇰", region: "mk", cur: "den (MKD)", lang: "mk", ll: [41.65, 21.7] },
  ro: { area: "balkans", name: "Romania", flag: "🇷🇴", region: "schengen", cur: "lei (RON)", lang: "ro", ll: [46.0, 24.9] },
  bg: { area: "balkans", name: "Bulgaria", flag: "🇧🇬", region: "schengen", cur: "€ (EUR, since 2026)", lang: "bg", ll: [42.75, 25.3] },
  tr: { area: "balkans", name: "Türkiye", flag: "🇹🇷", region: "tr", cur: "₺ (TRY)", lang: "tr", ll: [40.4, 29.9] },
  ru: { area: "east", name: "Russia", flag: "🇷🇺", region: "ru", cur: "₽ (RUB) — cash only for visitors", lang: "ru", ll: [57.2, 35.5],
    warn: "The Australian Government's advice for Russia is <b>Do not travel</b> (Smartraveller): risk of arbitrary detention, the war with Ukraine, and very limited consular help. Most travel insurance is void, Australian Visa/Mastercard cards don't work there, and there are no flights from the EU." },
};

/* Border zones outside Schengen: what entry looks like for Australians and for other passports.
   (Schengen, UK and Türkiye have fuller notes in app.js.) Checked November 2026. */
const REGIONS = {
  ie: { name: "Ireland", au: "Ireland: Australians don't need a visa for visits of up to 90 days. Ireland isn't in Schengen, so days there don't count towards your Schengen 90 — but if you continue to the UK (even by land into Northern Ireland) you still need a UK ETA.",
    other: "Ireland isn't in Schengen: check whether your passport needs an Irish visa (irishimmigration.ie)." },
  ba: { name: "Bosnia & Herzegovina", au: "Bosnia & Herzegovina: Australians are visa-free for up to 90 days. It's outside the EU and Schengen, so those days don't use up your Schengen 90.",
    other: "Bosnia & Herzegovina is outside the EU and Schengen — check its visa rules for your passport (mvp.gov.ba)." },
  rs: { name: "Serbia", au: "Serbia: Australians are visa-free for up to 90 days in any 180. Hotels register you with the police automatically; in a private apartment, check your host does it within 24 h. Days here don't count towards your Schengen 90.",
    other: "Serbia is outside the EU and Schengen — check its visa rules for your passport (mfa.gov.rs)." },
  me: { name: "Montenegro", au: "Montenegro: Australians are visa-free for up to 90 days. It uses the euro but isn't in the EU or Schengen, so days there don't count towards your Schengen 90. Pay the small tourist tax at your hotel (it registers you).",
    other: "Montenegro is outside the EU and Schengen — check its visa rules for your passport." },
  al: { name: "Albania", au: "Albania: Australians are visa-free for up to 90 days in any 180. Outside the EU and Schengen.",
    other: "Albania is outside the EU and Schengen — many passports are visa-free, others need a visa (e-albania.al)." },
  mk: { name: "North Macedonia", au: "North Macedonia: Australians are visa-free for up to 90 days in any 180. Outside the EU and Schengen.",
    other: "North Macedonia is outside the EU and Schengen — check its visa rules for your passport." },
  ru: { name: "Russia", au: "Russia: Smartraveller says <b>Do not travel</b>. Australians aren't eligible for Russia's e-visa, so you'd need a full tourist visa through a Russian consulate, with an invitation (voucher) from a hotel or agency. There are no flights from the EU (fly via Istanbul, Dubai or Belgrade), the Finnish land border is closed, and Western cards don't work — bring cash.",
    other: "Russia: most Western governments advise against all travel. Check whether your passport can use Russia's e-visa (evisa.kdmid.ru); otherwise apply at a consulate. No flights from the EU; Western cards don't work." },
};

const CITIES = {};
