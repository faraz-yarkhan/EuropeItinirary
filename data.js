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
   nightsRec — the number of nights we recommend. */

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

/* region: which border zone the country belongs to (passport checks happen between zones).
   lang: phrasebook language. ll: where to print the country's name on the route map. */
const COUNTRIES = {
  gb: { name: "United Kingdom", flag: "🇬🇧", region: "uk", cur: "£ (GBP)", lang: "en", ll: [52.6, -1.6] },
  fr: { name: "France", flag: "🇫🇷", region: "schengen", cur: "€ (EUR)", lang: "fr", ll: [46.6, 2.4] },
  nl: { name: "Netherlands", flag: "🇳🇱", region: "schengen", cur: "€ (EUR)", lang: "nl", ll: [52.6, 5.6] },
  be: { name: "Belgium", flag: "🇧🇪", region: "schengen", cur: "€ (EUR)", lang: "fr", ll: [50.5, 4.6] },
  de: { name: "Germany", flag: "🇩🇪", region: "schengen", cur: "€ (EUR)", lang: "de", ll: [51.0, 10.2] },
  ch: { name: "Switzerland", flag: "🇨🇭", region: "schengen", cur: "CHF", lang: "de", ll: [46.85, 8.2] },
  at: { name: "Austria", flag: "🇦🇹", region: "schengen", cur: "€ (EUR)", lang: "de", ll: [47.4, 14.2] },
  cz: { name: "Czechia", flag: "🇨🇿", region: "schengen", cur: "Kč (CZK)", lang: "cs", ll: [49.8, 15.4] },
  hu: { name: "Hungary", flag: "🇭🇺", region: "schengen", cur: "Ft (HUF)", lang: "hu", ll: [47.1, 19.3] },
  it: { name: "Italy", flag: "🇮🇹", region: "schengen", cur: "€ (EUR)", lang: "it", ll: [42.9, 12.6] },
  es: { name: "Spain", flag: "🇪🇸", region: "schengen", cur: "€ (EUR)", lang: "es", ll: [39.9, -3.6] },
  pt: { name: "Portugal", flag: "🇵🇹", region: "schengen", cur: "€ (EUR)", lang: "pt", ll: [39.6, -8.0] },
  gr: { name: "Greece", flag: "🇬🇷", region: "schengen", cur: "€ (EUR)", lang: "el", ll: [39.6, 21.9] },
  hr: { name: "Croatia", flag: "🇭🇷", region: "schengen", cur: "€ (EUR)", lang: "hr", ll: [45.3, 15.8] },
  ba: { name: "Bosnia & Herzegovina", flag: "🇧🇦", region: "ba", cur: "KM (BAM)", lang: "hr", ll: [44.2, 17.8] },
  tr: { name: "Türkiye", flag: "🇹🇷", region: "tr", cur: "₺ (TRY)", lang: "tr", ll: [40.4, 29.9] },
};

const CITIES = {};
