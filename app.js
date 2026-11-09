/* Europe Trip Planner — form, itinerary engine and rendering. Depends on data.js, cities-*.js and routes.js. */
(function () {
  "use strict";
  // The script is running, so remove the "can't run" notice
  const nojs = document.getElementById("nojs");
  if (nojs) nojs.parentNode.removeChild(nojs);

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  const SLOT = {
    m: { label: "Morning", time: "08:30 – 12:30" },
    e: { label: "Afternoon", time: "13:30 – 18:30" },
    n: { label: "Evening", time: "19:00 – 22:00" },
    full: { label: "Morning → Afternoon", time: "07:30 – 18:30" },
  };
  const BUDGET = {
    budget: { label: "Budget", day: "€110–170" },
    mid: { label: "Mid-range", day: "€220–350" },
    lux: { label: "Luxury", day: "€550+" },
  };
  const TIER = { lux: "Luxury", mid: "Mid-range", budget: "Budget" };
  const STORE = "eu-trip-planner-v1";

  // Give every place a stable id; typical minutes from each city centre to its airport
  Object.entries(CITIES).forEach(([cid, c]) => { c.id = cid; c.places.forEach((p, i) => (p.id = cid + "-" + i)); });
  // Best light → part of the day: sunrise/morning spots in the morning, sunset/blue-hour/night ones in the evening
  const whenSlots = (w) => {
    if (/any time/i.test(w)) return ["m", "e", "n"];
    const out = [];
    if (/sunrise|morning|opening|before|early/i.test(w)) out.push("m");
    if (/sunset|blue hour|night|evening|dusk|after dark|white nights/i.test(w)) out.push("n");
    if (!out.length || /afternoon|golden hour|midday|noon/i.test(w)) out.push("e");
    return out;
  };
  Object.entries(CITIES).forEach(([cid, c]) => (c.insta || []).forEach((x, k) => {
    if (!x.ll || c.places.some((p) => !p.insta && km(p.ll, x.ll) < 0.3)) return;
    c.places.push({ id: cid + "-ig" + k, insta: true, n: x.n, t: ["photo", "sightseeing"], s: whenSlots(x.when || ""), h: "45 min", c: "Usually free — check", ll: x.ll, r: 2,
      d: x.note + (x.when ? " Best time: " + x.when.toLowerCase() + "." : ""), tip: "An Instagram-worthy spot — arrive at the best time for light and fewer people." });
  }));
  const AIRPORT_MIN = {};
  Object.keys(CITIES).forEach((id) => (AIRPORT_MIN[id] = CITIES[id].apMin || 45));
  const ctry = (id) => COUNTRIES[CITIES[id].country];

  /* ---------- state ---------- */
  const DEFAULT = {
    start: "", pace: "balanced", budget: "mid", passport: "au", home: "syd", arrive: "par", depart: "rom", optimise: true, flights: {},
    countries: ["fr", "ch", "it"], hotels: {}, aud: true, eurAud: FX.eurAud,
    types: ["sightseeing", "culture", "food", "photo"], other: "",
    stops: [
      { city: "par", nights: 4, places: ["par-0", "par-1"] },
      { city: "int", nights: 2, places: [] },
      { city: "vce", nights: 2, places: [] },
      { city: "flr", nights: 2, places: [] },
      { city: "rom", nights: 3, places: [] },
    ],
  };
  const saved = load("form");
  let state = Object.assign(structuredCloneSafe(DEFAULT), saved || {});
  state.stops = (state.stops || []).filter((st) => CITIES[st.city]);
  state.countries = (state.countries || []).filter((c) => COUNTRIES[c]);
  state.hotels = state.hotels || {};
  state.custom = state.custom || {};
  syncCustomPlaces();
  // Follow each daily rate update unless the traveller typed their own rate
  if (!state.eurAudSet || !(+state.eurAud > 0)) state.eurAud = FX.eurAud;
  if (state.arrive && !CITIES[state.arrive]) state.arrive = "";
  if (state.depart && !CITIES[state.depart]) state.depart = "";
  let isExample = !saved;
  syncDays();

  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
  function load(k) { try { const v = localStorage.getItem(STORE + ":" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(STORE + ":" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  // The trip length follows the nights: nights in every city + 1 (the day you fly home)
  // Merge the traveller's own places into each city's list (they carry custom: true)
  function syncCustomPlaces() {
    Object.keys(CITIES).forEach((cid) => { const c = CITIES[cid]; c.places = c.places.filter((p) => !p.custom).concat((state.custom && state.custom[cid]) || []); });
  }
  function syncDays() { state.days = Math.max(2, state.stops.reduce((a, st) => a + (+st.nights || 0), 0) + 1); }

  /* ---------- geometry ---------- */
  function km(a, b) {
    if (!a || !b) return 0;
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const round5 = (n) => Math.round(n / 5) * 5;

  /* ---------- your hotel in each city ---------- */
  const PICK_LABEL = { best: "★ Best pick", rec: "Recommended pick", budget: "Low budget pick", custom: "Your own hotel" };
  const BUDGET_PICK = { lux: "best", mid: "rec", budget: "budget" };
  function hotelOf(cid) {
    const c = CITIES[cid], h = state.hotels && state.hotels[cid];
    if (h && h.n && h.ll) return { n: h.n, ll: h.ll, area: h.area || c.stay.area, chosen: true, pick: h.pick };
    return { n: null, ll: c.stay.ll, area: c.stay.area, chosen: false };
  }
  const hotelLabel = (cid) => { const h = hotelOf(cid); return h.chosen ? h.n : "your hotel in " + CITIES[cid].stay.area; };
  function hotelPoint(city) {
    const h = hotelOf(city.id);
    return { n: h.chosen ? h.n : "your hotel (" + city.stay.area + ")", ll: h.ll, m: h.chosen ? null : city.stay.m, hotel: true };
  }
  // "€120–220 a night", "CHF 260–420 a night", "2,000–3,300 Kč a night"
  function priceText(city, h) {
    const lo = money(city, h.price[0]), hi = money(city, h.price[1]);
    const suffix = lo.indexOf(city.cur) !== 0;
    return (suffix ? lo.replace(/\s\S+$/, "") + "–" + hi : lo + "–" + hi.slice(city.cur.length)) + " a night";
  }
  const curOf = (cid) => CUR_CODE[CITIES[cid].country] || "EUR";
  const flagOf = (cid) => (CITIES[cid] ? COUNTRIES[CITIES[cid].country].flag : "");
  const fname = (cid) => flagOf(cid) + " " + CITIES[cid].name; // "🇫🇷 Paris"
  const fromCentre = (city, ll) => { const d = km(city.stay.ll, ll); return d < 0.4 ? "in the centre" : d < 1.5 ? `${Math.round((d * 1.35 / 4.5) * 60)} min walk from the centre` : `${d.toFixed(1)} km from the centre`; };

  // Local-currency amount, rounded sensibly (Kč, Ft and KM go after the number)
  function money(city, n) {
    const c = String(city.cur).trim();
    const v = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.max(1, Math.round(n));
    const t = v.toLocaleString("en-US");
    return /^(Kč|Ft|KM|kr|zł|lei|din|den|L|₽)$/.test(c) ? t + " " + c : city.cur + t;
  }

  // Travel time for an out-of-town place, read from its directions ("train (~1 h), then a 20 min walk") plus getting to the station
  function xMinsOf(p) {
    if (!p || !p.x) return null;
    if (p.xMins) return p.xMins;
    const first = String(p.x).split(/\.\s/)[0];
    const re = /(\d+(?:[.,]\d+)?|\d*½)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?½?))?\s*(h|min)\b(?:\s+(\d{1,2})\b(?!\s*(?:h|min)))?/g;
    const num = (v) => (v == null ? null : /½/.test(v) ? (parseFloat(v) || 0) + 0.5 : parseFloat(String(v).replace(",", ".")));
    let total = 0, m;
    while ((m = re.exec(first))) {
      const a = num(m[1]), b = num(m[2]), v = b != null ? (a + b) / 2 : a;
      total += m[3] === "h" ? v * 60 + (m[4] ? +m[4] : 0) : v;
    }
    return total ? Math.round(total + 25) : null;
  }
  /* How to get from A to B inside a city */
  function getThere(from, to, city) {
    const d = km(from.ll, to.ll);
    const farMins = (to.x && xMinsOf(to)) || (from.x && xMinsOf(from)) || Math.round(((d * 1.35) / 45) * 60 + 15);
    if (d < 0.15) return { mode: "Walk", mins: 0, text: "You're already here." };
    if (to.x && d > 12) return { mode: "Trip", mins: to.xMins || farMins, text: esc(to.x) };
    if (from.x && d > 12) {
      if (from.xMins) return { mode: "Return", mins: from.xMins, text: "Head back the way you came: " + esc(from.x) };
      if (to.hotel) return { mode: "Return", mins: farMins, text: "Head back the way you came: " + esc(from.x) };
      const onward = getThere(hotelPoint(city), to, city);
      return { mode: "Return", mins: farMins, text: "Head back to town the way you came, then: " + onward.text };
    }
    const road = d * 1.35;
    const walk = Math.round((road / 4.5) * 60);
    const [base, baseKm, perKm] = city.taxi;
    const fare = money(city, Math.max(base, base + Math.max(0, road - baseKm) * perKm));
    const car = Math.round((road / (d > 15 ? 40 : 20)) * 60 + 5);
    const ride = city.ride;
    if (d < 1.3) return { mode: "Walk", mins: walk, text: `Walk about ${walk} min (${d.toFixed(1)} km).` };
    if (d < 2.5) return { mode: "Walk", mins: walk, text: `Walk about ${walk} min${city.metro ? `, or hop on the ${esc(city.metro)}` : ""}, or a short ${esc(ride)} (~${fare}).` };
    if (city.metro) {
      const mm = Math.round((road / 22) * 60 + 12);
      return { mode: "Transit", mins: mm, text: `${esc(city.metro)}${to.m ? ` to <b>${esc(to.m)}</b>` : ""}, about ${mm} min door to door (Google Maps or Citymapper show the exact route). Or ${esc(ride)} ~${car} min, approx. ${fare}.` };
    }
    return { mode: "Taxi", mins: car, text: `${esc(cap(ride))} ~${car} min, approx. ${fare}. Local buses are cheaper — check Google Maps.` };
  }

  /* Intercity route */
  function routeText(a, b) {
    if (a === b) return "Same city — no transfer needed.";
    const k1 = a + "|" + b, k2 = b + "|" + a;
    if (ROUTES[k1]) return ROUTES[k1];
    if (ROUTES[k2]) return ROUTES[k2];
    const A = CITIES[a], B = CITIES[b];
    const d = km(A.stay.ll, B.stay.ll);
    const name = `${A.name} → ${B.name}`;
    const opts = modesFor(a, b);
    if (opts.includes("train") && d < 450) return `${name}: train, roughly ${((d * 1.2) / 140 + 0.3).toFixed(1)} h. Compare times and fares on Trainline, Omio or the national rail app.`;
    if (opts.includes("train") && d < 900) return `${name}: train ~${((d * 1.2) / 150 + 0.5).toFixed(0)} h, or fly ~${(d / 750 + 0.5).toFixed(1)} h plus airport time. Compare on Trainline/Omio and Google Flights.`;
    if (!opts.includes("flight")) return `${name}: coach, about ${((d * 1.3) / 70).toFixed(0)} h — there's no railway on this route. Compare on FlixBus or GetByBus.`;
    return `${name}: fly (~${(d / 750 + 0.5).toFixed(1)} h in the air, often with a low-cost airline — check bag fees). Compare on Google Flights or Skyscanner.`;
  }
  // Passport control happens between zones (Schengen, UK, Bosnia & Herzegovina, Türkiye)
  const crossesBorder = (a, b) => ctry(a).region !== ctry(b).region;
  const newCountry = (a, b) => CITIES[a].country !== CITIES[b].country;

  /* Halal food nearest a point */
  function eatNear(city, ll, n = 2) {
    const located = city.halal.filter((h) => h.ll).map((h) => ({ ...h, d: km(ll, h.ll) })).sort((a, b) => a.d - b.d).slice(0, n);
    const general = city.halal.filter((h) => !h.ll);
    return { located, general, far: !located.length || located[0].d > 4 };
  }
  // Nearest café / photo spot / anything with a location, optionally within max km
  function nearest(list, ll, max) {
    if (!ll) return null;
    return (list || []).filter((x) => x.ll).map((x) => Object.assign({}, x, { d: km(ll, x.ll) })).filter((x) => max == null || x.d <= max).sort((a, b) => a.d - b.d)[0] || null;
  }

  /* ---------- Australians & Sydney ---------- */
  const isAU = () => state.passport === "au";
  const fromSyd = () => state.home === "syd";
  // Nights in each border zone: Schengen days add up across all Schengen countries
  function zoneNights() {
    const out = {};
    state.stops.forEach((st) => { const r = ctry(st.city).region; out[r] = (out[r] || 0) + st.nights; });
    return out;
  }
  function sydLine(id, dir) {
    const f = SYD_FLIGHTS[id];
    if (!f) return "";
    return dir === "in"
      ? `<b>From Sydney:</b> ${esc(f.text)} Arrive at ${esc(f.airport)}. Central Europe is 8–10 h behind Sydney (the UK and Portugal 9–11 h, Greece and Türkiye 7–9 h), so expect real jet lag: get outside in daylight and stay up until about 21:00 on day 1.`
      : `<b>Back to Sydney:</b> ${esc(f.text)} Fly out of ${esc(f.airport)}.`;
  }

  /* ---------- when the data was last checked ---------- */
  // "5 Nov 2026" from "2026-11-05"
  const refreshedLabel = (() => { const d = new Date(DATA_INFO.refreshed + "T00:00:00"); return isNaN(d) ? DATA_INFO.refreshed : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })();
  const refreshLine = () => `Data last refreshed: ${refreshedLabel} (${DATA_INFO.covers}). Checked daily.`;

  /* ---------- approximate AUD next to local prices ---------- */
  const CUR_TOK = { "≈€": "EUR", "€": "EUR", "£": "GBP", CHF: "CHF", "Kč": "CZK", Ft: "HUF", "zł": "PLN", lei: "RON", din: "RSD", den: "MKD", KM: "BAM", "₽": "RUB", "₺": "TRY" };
  const NUM = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  const RNG = "(" + NUM + ")(?:\\s?[–-]\\s?(?:€|£)?(" + NUM + "))?";
  const RE_PRE = new RegExp("(≈€|€|£|CHF|kr|KM|₽|₺)\\s?~?" + RNG + "(?![\\d.,]?\\d)(?!\\s?\\(≈A\\$)", "g");
  const RE_POST = new RegExp(RNG + "\\s?(Kč|Ft|zł|lei|din|den|KM|₽|kr|L)(?![A-Za-zÀ-ž])(?!\\s?\\(≈A\\$)", "g");
  const toAUD = (n, code) => (FX.perEur[code] ? (n / FX.perEur[code]) * (+state.eurAud || FX.eurAud) : null);
  const fmtAUD = (v) => (v < 100 ? Math.max(1, Math.round(v)) : v < 1000 ? Math.round(v / 5) * 5 : v < 10000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50).toLocaleString("en-US");
  // "€25–30" → "€25–30 (≈A$40–50)". kr and L are only converted when the surrounding city says which currency they are.
  function audText(t, ctx) {
    const conv = (whole, tok, a, b) => {
      const code = tok === "kr" ? (["DKK", "SEK", "NOK", "ISK"].indexOf(ctx) >= 0 ? ctx : null) : tok === "L" ? (ctx === "ALL" ? "ALL" : null) : CUR_TOK[tok];
      const n1 = +a.replace(/,/g, ""), n2 = b ? +b.replace(/,/g, "") : null;
      if (!code || (tok === "L" && n1 < 100)) return whole;
      const x1 = toAUD(n1, code);
      if (x1 == null) return whole;
      return whole + " (≈A$" + fmtAUD(x1) + (n2 != null ? "–" + fmtAUD(toAUD(n2, code)) : "") + ")";
    };
    return String(t).replace(RE_PRE, (w, tok, a, b) => conv(w, tok, a, b)).replace(RE_POST, (w, a, b, tok) => conv(w, tok, a, b));
  }
  function audifyIn(root) {
    if (!root || state.aud === false) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      const v = n.nodeValue, p = n.parentNode;
      if (!/\d/.test(v) || !p || !p.closest || p.closest("script, style, svg, .no-aud")) return;
      const el = p.closest("[data-cur]");
      const out = audText(v, el ? el.getAttribute("data-cur") : null);
      if (out !== v) n.nodeValue = out;
    });
  }

  /* ---------- itinerary engine ---------- */
  /* ---------- "Tell us what you do or don't want": free text → things to favour and to leave out ---------- */
  // label · what the traveller might write · how to recognise matching places
  const nm = (p) => (p.n + " " + (p.loc || "")).toLowerCase();
  const all = (p) => (p.n + " " + (p.loc || "") + " " + p.d + " " + p.t.join(" ")).toLowerCase();
  const CONCEPTS = [
    { id: "museums", label: "museums & galleries", user: /museum|galler(y|ies)|exhibition/, test: (p) => /museum|museo|musée|gallery|galleria|galerie|louvre|prado|uffizi|hermitage|rijks|orsay|accademia|tretyakov|kunsthistorisches|chester beatty|polin|vasa|munch|belvedere|borghese|van gogh/.test(nm(p)) },
    { id: "art", label: "art", user: /\bart\b|arts\b|paint|artist|sculpt/, test: (p) => /museum|gallery|galleria|louvre|uffizi|orsay|prado|belvedere|munch|borghese|van gogh|accademia|sculpture|magritte|matisse/.test(nm(p)) },
    { id: "historic", label: "historical buildings & landmarks", user: /histor|heritage|old buildings?|architect|landmark|monument|medieval|old towns?/, test: (p) => p.t.includes("history") && !/museum|gallery/.test(nm(p)) || /castle|palace|cathedral|basilica|church|mosque|fortress|abbey|monastery|citadel|old town|bridge|alhambra|alcázar|kremlin|parliament|gate|walls?\b|square/.test(nm(p)) },
    { id: "castles", label: "castles & palaces", user: /castle|palace|royal|fortress|kings?\b|queens?\b|chateau|château/, test: (p) => /castle|palace|fortress|citadel|kremlin|alcázar|alhambra|residenz|hofburg|schönbrunn|versailles|wawel|château|neuschwanstein|bastion/.test(nm(p)) },
    { id: "churches", label: "churches & cathedrals", user: /church|cathedral|basilica|chapel|religious sites?|christian/, test: (p) => /church|cathedral|basilica|chapel|abbey|monastery|duomo|notre-dame|sagrada|sacré|st peter|st mark|st stephen's cathedral|st vitus|kirche/.test(nm(p)) },
    { id: "islamic", label: "mosques & Islamic heritage", user: /mosque|islam|muslim|ottoman|moorish|\bmoors?\b|andalus/, test: (p) => p.t.includes("islamic") || /mosque|mezquita|alhambra|bazaar/.test(nm(p)) },
    { id: "ruins", label: "ancient ruins", user: /ancient|ruins?\b|roman|greek|archaeolog/, test: (p) => /ruins|forum|colosseum|acropolis|pompeii|agora|temple|akrotiri|diocletian|amphitheat|pantheon/.test(nm(p)) },
    { id: "nature", label: "nature & scenery", user: /nature|outdoors?|mountains?|lakes?\b|waterfalls?|scenery|scenic|countryside|fjords?|national park|gardens?|parks?\b|green/, test: (p) => p.t.includes("nature") },
    { id: "hiking", label: "hikes & long walks", user: /hik(e|es|ing)|trek|trails?|long walks?|walking tours?/, test: (p) => /hike|hiking|trail|path of|walk\b|cliff walk|caldera hike/.test(all(p)) },
    { id: "climbs", label: "lots of stairs & climbs", user: /stairs|steps|climb(s|ing)?|steep|towers?\b/, test: (p) => /climb|steps|stairs|steep|\d{3,4} steps|fortress climb/.test(all(p)) },
    { id: "beaches", label: "beaches & swimming", user: /beach|swim|seaside|coast|islands?\b/, test: (p) => /beach|lagoon|swim|island\b|islands|coast/.test(all(p)) },
    { id: "views", label: "views & viewpoints", user: /views?\b|panoram|rooftops?|lookouts?|skyline|sunsets?|viewpoints?/, test: (p) => /view|panoram|rooftop|lookout|summit|terrace|bastion|hill\b|tower|cable car|funicular|sunset/.test(all(p)) },
    { id: "shopping", label: "shopping & markets", user: /shop|markets?\b|bazaars?|souvenir|malls?\b/, test: (p) => p.t.includes("shopping") || /market|bazaar|strøget|quadrilatero/.test(nm(p)) },
    { id: "food", label: "food & markets", user: /food|eating|cuisine|foodie|dessert/, test: (p) => p.t.includes("food") },
    { id: "shows", label: "shows & concerts", user: /\bshows?\b|concerts?|theat(re|er)|opera|music|flamenco|musical/, test: (p) => /show|concert|theatre|opera|flamenco|musical|west end|tablao/.test(all(p)) },
    { id: "themeparks", label: "theme parks", user: /theme parks?|amusement|disney|rides\b|roller ?coaster/, test: (p) => /disney|tivoli|prater|amusement|harry potter|studio tour/.test(nm(p) + " " + p.d.toLowerCase()) },
    { id: "kids", label: "kid-friendly places", user: /\bkids?\b|children|child|toddler|family/, test: (p) => p.t.includes("family") },
    { id: "daytrips", label: "long day trips out of town", user: /day ?trips?|excursions?|out of (the )?(town|city)|long (journeys?|drives?|trips?)|far away|travel(ling)? far/, test: (p) => !!p.x },
    { id: "boats", label: "boat trips & cruises", user: /boats?\b|cruises?|ferr(y|ies)|river trips?|canals?|gondola|sailing/, test: (p) => /cruise|boat|gondola|canal tour|ferry|sailing/.test(all(p)) },
    { id: "war", label: "war & dark history", user: /war history|dark history|military history|\bwars?\b|ww ?i?i|world war|holocaust|concentration|genocide|dark history|sad|depressing|grim/, test: (p) => /war\b|uprising|occupation|auschwitz|holocaust|memorial|bunker|kgb|siege|topography of terror|gaol|checkpoint|bunk'art/.test(all(p)) },
    { id: "adventure", label: "adventure & thrills", user: /adventure|adrenaline|thrill|paraglid|zip ?line|extreme|bungee/, test: (p) => p.t.includes("adventure") },
    { id: "animals", label: "zoos, aquariums & wildlife", user: /\bzoos?\b|aquarium|animals?|wildlife|whales?/, test: (p) => /zoo|aquarium|oceanário|whale|bear|animals|skansen/.test(all(p)) },
    { id: "photo", label: "photo spots", user: /photo|instagram|pictures/, test: (p) => p.t.includes("photo") },
    { id: "spa", label: "spas & thermal baths", user: /\bspas?\b|thermal|baths?\b|hammam|sauna|lagoon/, test: (p) => /bath|spa\b|hammam|sauna|lagoon/.test(all(p)) },
  ];
  // Most specific phrases first, removed once matched ("war history" isn't "historical buildings", "theme parks" isn't "parks")
  const WISH_ORDER = ["war", "themeparks", "daytrips", "boats", "spa", "animals", "islamic", "castles", "churches", "ruins", "museums"].map((id) => CONCEPTS.find((c) => c.id === id))
    .concat(CONCEPTS.filter((c) => ["war", "themeparks", "daytrips", "boats", "spa", "animals", "islamic", "castles", "churches", "ruins", "museums"].indexOf(c.id) < 0));
  const NEG = /\b(no|not|don'?t|dont|do not|doesn'?t|avoid|skip|without|hate|dislike|less|fewer|never|nothing|exclude|rather not|not into|not a fan|isn'?t|aren'?t|can'?t stand|no more)\b/;
  const MOBILITY = /mobility|wheelchair|knees?|bad (back|hip|legs?)|elderly|pram|stroller|can'?t walk|cannot walk|limited walking/;
  const WISH_STOP = new Set(["want", "wants", "would", "like", "love", "really", "visit", "visiting", "see", "seeing", "include", "including", "please", "trip", "more", "lots", "much", "very", "also", "with", "that", "this", "these", "those", "things", "stuff", "place", "places", "some", "any", "lot", "into", "enjoy", "prefer", "interested", "about", "much", "time", "spend", "just", "only", "maybe", "should", "could", "where", "there", "them", "they", "have", "being", "doing", "going", "plenty", "every", "other", "kind", "kinds", "type", "types", "fan", "fans", "big", "huge", "make", "sure", "able", "well", "good", "great", "nice", "fun", "something", "anything", "everything", "less", "fewer", "dont", "don't", "hate", "avoid", "skip", "without", "rather", "dislike", "never", "nothing", "exclude", "and", "the", "for", "not", "but", "building", "buildings", "site", "sites", "sight", "sights", "sightseeing", "attraction", "attractions", "spot", "spots", "activities", "activity", "experience", "experiences", "tour", "tours", "visits", "stops", "days", "mostly", "mainly", "especially", "definitely", "too", "really", "want", "wanna", "would", "love", "like", "likes", "loves", "kids", "mum", "mom", "dad", "wife", "husband", "parents", "mother", "father", "family", "long", "short", "trip", "trips", "journey", "journeys", "knee", "knees", "back", "legs", "walking", "elderly", "she", "he", "her", "his", "our", "their", "we're", "i'd", "i'm", "we'd", "lot"]);
  // Split into clauses at "but", sentence ends and ", I…" — then everything after a negative word in a clause is unwanted
  function parseWishes(text) {
    const out = { inc: [], exc: [], incWords: [], excWords: [], mobility: false };
    const t = String(text || "").toLowerCase().replace(/[’`]/g, "'").trim();
    if (!t) return out;
    if (MOBILITY.test(t)) { out.mobility = true; ["climbs", "hiking"].forEach((id) => out.exc.push(CONCEPTS.find((c) => c.id === id))); }
    t.split(/[.;!?\n]|\bbut\b|\bhowever\b|\balthough\b|\bwhereas\b|\bexcept\b|,\s*(?=(?:i|we|and i|and we|please|also)\b)/).forEach((seg) => {
      const m = seg.match(NEG);
      const pos = m ? seg.slice(0, m.index) : seg, neg = m ? seg.slice(m.index + m[0].length) : "";
      [[pos, out.inc, out.incWords], [neg, out.exc, out.excWords]].forEach(([part, list, words]) => {
        let rest = part;
        WISH_ORDER.forEach((c) => { if (c.user.test(rest)) { if (list.indexOf(c) < 0) list.push(c); rest = rest.replace(new RegExp("[a-zà-ž'-]*(?:" + c.user.source + ")[a-zà-ž'-]*", "g"), " "); } });
        rest.split(/[^a-zà-ž]+/).filter((w) => w.length > 3 && !WISH_STOP.has(w)).forEach((w) => { if (words.indexOf(w) < 0) words.push(w); });
      });
    });
    // something both wanted and unwanted (e.g. "no museums but art galleries") — the explicit "no" wins only for its own concept
    out.inc = out.inc.filter((c) => out.exc.indexOf(c) < 0);
    return out;
  }
  const wishExcluded = (p, w) => w.exc.some((c) => c.test(p)) || w.excWords.some((x) => all(p).indexOf(x) >= 0);
  const wishLabels = (p, w) => w.inc.filter((c) => c.test(p)).map((c) => c.label).concat(w.incWords.filter((x) => all(p).indexOf(x) >= 0).map((x) => "“" + x + "”"));
  function wishSummary(w) {
    const bits = [];
    if (w.inc.length || w.incWords.length) bits.push("more " + w.inc.map((c) => c.label).concat(w.incWords.map((x) => "“" + x + "”")).join(", "));
    if (w.exc.length || w.excWords.length) bits.push("leaving out " + w.exc.map((c) => c.label).concat(w.excWords.map((x) => "“" + x + "”")).join(", "));
    return bits.join("; ");
  }

  function prefsFrom(s) {
    const types = new Set();
    s.types.forEach((t) => {
      const def = TRIP_TYPES.find((x) => x.id === t);
      (def && def.tags ? def.tags : [t]).forEach((x) => types.add(x));
    });
    const stop = new Set(["with", "that", "this", "some", "like", "want", "have", "trip", "and", "the", "more", "lots", "very"]);
    const words = (s.other || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !stop.has(w));
    return { types, words, wish: parseWishes(s.wishes), pace: s.pace, fullTotal: 0 };
  }

  function pick(ctx, slot, prev, o = {}) {
    const { city, used, sel, prefs, dow } = ctx;
    const pool = city.places.filter((p) => {
      if (used.has(p.id)) return false;
      if (dow != null && p.cl && p.cl.includes(dow)) return false;
      if (!sel.has(p.id) && wishExcluded(p, prefs.wish)) return false; // the traveller said they don't want this
      if (slot === "m") return p.s.includes("m") || (o.allowFull && p.s.includes("full"));
      return p.s.includes(slot);
    });
    const scored = pool.map((p) => {
      const chosen = sel.has(p.id);
      const match = p.t.filter((t) => prefs.types.has(t)).length;
      let sc = (chosen ? 1000 : 0) + (p.r || 1) * 9 + match * 8;
      if (prefs.words.length) {
        const hay = (p.n + " " + p.d + " " + p.t.join(" ")).toLowerCase();
        if (prefs.words.some((w) => hay.includes(w))) sc += 14;
      }
      const dist = km(prev.ll, p.ll);
      sc -= Math.min(dist, 40) * (o.near ? 2.2 : 0.5);
      sc += wishLabels(p, prefs.wish).length * 22;
      if (p.insta && !chosen) sc -= 30; // photo spots fill gaps; they're planned for sure when you pick them
      if (p.s.includes("full") && !chosen && !match) sc -= 10;
      if (o.near && p.x) sc -= 30;
      return { p, sc };
    }).sort((a, b) => b.sc - a.sc);
    return [scored[0] && scored[0].p, scored[1] && scored[1].p];
  }

  function activity(ctx, part, p, alt, prev) {
    const city = ctx.city;
    const matched = TRIP_TYPES.filter((t) => (t.tags || [t.id]).some((x) => p.t.includes(x)) && ctx.prefs.types.has((t.tags || [t.id])[0])).map((t) => t.label);
    const wl = wishLabels(p, ctx.prefs.wish);
    const why = p.custom ? ["pick", "Your own place"] : p.insta && ctx.sel.has(p.id) ? ["pick", "📸 Your photo spot"] : p.insta ? ["rec", "📸 Instagram spot"] : ctx.sel.has(p.id) ? ["pick", "Your pick"] : wl.length ? ["top", "Matches your wishes · " + wl[0]] : p.r === 3 ? ["top", "★ Top rated"] : matched.length ? ["rec", "Recommended · " + matched.slice(0, 2).join(", ")] : ["rec", "Recommended"];
    const slot = { part, type: "act", p, alt, why, how: getThere(prev, p, city), insta: p.insta ? null : nearest(city.insta, p.ll, 1.5) };
    const foodCity = p.dayCity && CITIES[p.dayCity] ? CITIES[p.dayCity] : city;
    if (part === "m" || part === "full") slot.eat = { label: part === "full" ? (p.dayCity ? `Lunch in ${foodCity.name.replace(/ \(.*\)/, "")} (halal)` : "Lunch (halal)") : "Lunch nearby (halal)", ...eatNear(foodCity, p.ll) };
    if (part === "n") slot.eat = { label: "Dinner nearby (halal)", ...eatNear(city, p.ll) };
    return slot;
  }

  function buildPlan(s) {
    const prefs = prefsFrom(s);
    const startDate = s.start ? new Date(s.start + "T00:00:00") : null;
    const usedByCity = {};
    const days = [];
    const warnings = [];
    const stopCtx = s.stops.map((st) => {
      const city = CITIES[st.city];
      usedByCity[st.city] = usedByCity[st.city] || new Set();
      return { id: st.city, city, used: usedByCity[st.city], sel: new Set(st.places), prefs, nights: st.nights, fullCount: 0 };
    });

    const arriveId = s.arrive || stopCtx[0].id;
    const departId = s.depart || stopCtx[stopCtx.length - 1].id;
    if (arriveId !== stopCtx[0].id && km(CITIES[arriveId].stay.ll, stopCtx[0].city.stay.ll) > 700)
      warnings.push(`You land in ${CITIES[arriveId].name} but your first stop is ${stopCtx[0].city.name}, a long onward journey on day 1. Consider adding ${CITIES[arriveId].name} as your first stop, or changing your arrival city.`);
    if (departId !== stopCtx[stopCtx.length - 1].id && km(CITIES[departId].stay.ll, stopCtx[stopCtx.length - 1].city.stay.ll) > 700)
      warnings.push(`Your last stop is ${stopCtx[stopCtx.length - 1].city.name} but you fly home from ${CITIES[departId].name}. Book the international flight for the evening, or travel there the day before.`);

    let dayIdx = 0;
    const dateFor = (i) => (startDate ? new Date(startDate.getTime() + i * 86400000) : null);

    stopCtx.forEach((ctx, si) => {
      for (let k = 0; k < ctx.nights; k++) {
        const kind = si === 0 && k === 0 ? "arrival" : k === 0 ? "transfer" : "full";
        const legFrom = si > 0 ? stopCtx[si - 1].id : arriveId;
        days.push(makeDay(ctx, kind, dateFor(dayIdx), si > 0 ? stopCtx[si - 1] : null, arriveId, k === 0 ? legTimesFor(s.stops[si], legFrom) : null));
        dayIdx++;
      }
    });
    const last = stopCtx[stopCtx.length - 1];
    days.push(makeDay(last, "depart", dateFor(dayIdx), null, departId));
    // Show each photo spot once per day
    days.forEach((d) => { const seen = new Set(); d.slots.forEach((sl) => { if (sl.insta) { if (seen.has(sl.insta.n)) sl.insta = null; else seen.add(sl.insta.n); } }); });

    const F = s.flights || {};
    const inT = toMin(F.inTime), outT = toMin(F.outTime);
    if (inT != null && inT >= 21 * 60) warnings.push(`Your flight lands at ${F.inTime}, so day 1 is just getting to the hotel. Pre-book an airport transfer or note where taxis and ride-hailing pick up.`);
    if (outT != null && outT - INTL_BUFFER - (AIRPORT_MIN[departId] || 60) < 5 * 60) warnings.push(`Your flight home takes off at ${F.outTime}, so you'd leave the hotel in the small hours. Consider a hotel near the airport for the last night, and book the taxi the evening before.`);

    // Selected places that didn't fit
    stopCtx.forEach((ctx) => {
      const missed = [...ctx.sel].filter((id) => !ctx.used.has(id)).map((id) => ctx.city.places.find((p) => p.id === id)).filter(Boolean);
      if (missed.length) warnings.push(`${ctx.city.name}: no room for ${missed.map((p) => p.n).join(", ")}. Add a night there, or swap it for another pick (full-day trips need a full day, not an arrival or travel day).`);
    });
    return { days, warnings, stops: stopCtx, arriveId, departId };
  }

  /* ---------- times (all local, minutes after midnight) ---------- */
  const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const p = t.split(":"); return +p[0] * 60 + +p[1]; };
  const hhmm = (m) => { m = (((Math.round(m / 5) * 5) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const IMMIGRATION = 75; // landing → through immigration with bags
  const INTL_BUFFER = 180; // at the airport this long before an international take-off
  // Time to leave the hotel before a train/flight departs
  const legLead = (a, b) => modeEstimate(legMode(a, b), a, b).lead;
  // Door-to-door estimate between two cities for the chosen (or recommended) mode
  const legMinutes = (a, b) => modeEstimate(legMode(a, b), a, b).door;
  // Which parts of the day are still usable after you're ready, or before you must leave
  const freeAfter = (ready) => ({ m: ready <= 9 * 60 + 30, e: ready <= 16 * 60, n: ready <= 20 * 60 + 30 });
  const freeBefore = (leave) => ({ m: leave >= 12 * 60 + 30, e: leave >= 18 * 60 + 30, n: leave >= 22 * 60 });
  const partAt = (t) => (t < 12 * 60 + 30 ? "m" : t < 18 * 60 + 45 ? "e" : "n");
  // A stop's "getting here" times count only if they were entered for the same previous city
  const legTimesFor = (st, fromId) => (st && st.leg && st.leg.from === fromId ? st.leg : {});

  function travelSlot(fromId, toId, extra) {
    const from = CITIES[fromId], to = CITIES[toId];
    const li = legInfo(fromId, toId);
    return Object.assign({ part: "m", type: "travel", from, to, fromId, toId, leg: li, text: li.text || routeText(fromId, toId), border: crossesBorder(fromId, toId), newCountry: newCountry(fromId, toId), arrive: to.arrive }, extra);
  }

  function makeDay(ctx, kind, date, prevCtx, flyId, legTimes) {
    const city = ctx.city;
    const hotel = hotelPoint(city);
    ctx.dow = date ? date.getDay() : null;
    const day = { kind, city, cityId: ctx.id, date, slots: [], friday: date && date.getDay() === 5 };
    const F = state.flights || {};
    let prev = hotel;
    let free = { m: true, e: true, n: true };

    if (kind === "arrival") {
      day.flyIn = flyId;
      const land = toMin(F.inTime);
      if (flyId === ctx.id) {
        const ready = land == null ? null : land + IMMIGRATION + (AIRPORT_MIN[flyId] || 60);
        day.slots.push({ part: land == null ? "m" : partAt(land), type: "arrive", text: city.arrive, city, flyIn: flyId, land, ready, flightNo: F.inNo, when: land == null ? null : "Lands " + hhmm(land) });
        free = ready == null ? { m: false, e: true, n: true } : freeAfter(ready);
      } else {
        const lt = legTimes || {};
        let dep = toMin(lt.dep), arr = toMin(lt.arr);
        const est = dep == null && arr == null;
        if (dep == null && land != null) dep = land + IMMIGRATION + 60 + (legMode(flyId, ctx.id) === "flight" ? 60 : legMode(flyId, ctx.id) === "car" ? 0 : 30);
        if (arr == null && dep != null) arr = dep + legMinutes(flyId, ctx.id) - legLead(flyId, ctx.id) - 40;
        day.slots.push({ part: land == null ? "m" : partAt(land), type: "arrive", via: true, city: CITIES[flyId], flyIn: flyId, land, flightNo: F.inNo, when: land == null ? null : "Lands " + hhmm(land),
          text: `Clear immigration and customs in ${CITIES[flyId].name}, then continue straight to ${city.name}.` });
        day.slots.push(travelSlot(flyId, ctx.id, { sameDay: true, part: dep == null ? "e" : partAt(dep), dep, arr, est, when: dep == null ? null : hhmm(dep) + " → " + hhmm(arr) }));
        free = arr == null ? { m: false, e: false, n: true } : freeAfter(arr + 60);
      }
    }

    if (kind === "transfer") {
      const lt = legTimes || {};
      const dep = toMin(lt.dep);
      let arr = toMin(lt.arr);
      const extra = { part: dep == null ? "m" : partAt(dep), dep, arr };
      if (dep != null) {
        const leave = dep - legLead(prevCtx.id, ctx.id);
        extra.leaveBy = leave;
        // Late departure: fit in a morning stop near the old hotel first
        if (freeBefore(leave).m) {
          const ph = hotelPoint(prevCtx.city);
          prevCtx.dow = ctx.dow;
          const [a, alt] = pick(prevCtx, "m", ph, { near: true });
          if (a) {
            prevCtx.used.add(a.id);
            const sl = activity(prevCtx, "m", a, alt, ph);
            sl.inCity = prevCtx.city; sl.when = "08:30 – " + hhmm(leave - 45);
            day.slots.push(sl);
            extra.collect = getThere(a, ph, prevCtx.city).text;
          }
        }
        if (arr == null) { arr = dep + legMinutes(prevCtx.id, ctx.id) - legLead(prevCtx.id, ctx.id) - 40; extra.est = true; }
      }
      if (dep != null) extra.when = hhmm(dep) + " → " + hhmm(arr);
      extra.arr = arr;
      day.slots.push(travelSlot(prevCtx.id, ctx.id, extra));
      free = arr == null ? { m: false, e: true, n: true } : freeAfter(arr + 60);
    }

    if (kind === "full") {
      ctx.fullCount++;
      ctx.prefs.fullTotal++;
      // On Fridays keep the morning close to a mosque so Jumu'ah fits in
      const mosque = day.friday && city.mosques.find((x) => x.ll);
      const [a, alt] = mosque ? pick(ctx, "m", { ll: mosque.ll }, { near: true, allowFull: true }) : pick(ctx, "m", prev, { allowFull: true });
      if (a) {
        ctx.used.add(a.id);
        const part = a.s.includes("full") ? "full" : "m";
        day.slots.push(activity(ctx, part, a, alt, prev));
        prev = a;
      }
    } else if ((kind === "arrival" || kind === "transfer") && free.m) {
      // Early arrival: a light morning stop near the hotel (bags can wait at reception)
      const [a, alt] = pick(ctx, "m", prev, { near: true });
      if (a) { ctx.used.add(a.id); day.slots.push(activity(ctx, "m", a, alt, prev)); prev = a; day.earlyBags = true; }
    }

    if (kind === "depart") {
      day.flyOut = flyId;
      const off = toMin(F.outTime);
      const via = flyId !== ctx.id;
      const leave = off == null ? null : via ? off - INTL_BUFFER - legMinutes(ctx.id, flyId) : off - INTL_BUFFER - (AIRPORT_MIN[flyId] || 60);
      // last day: an afternoon activity fits if you leave the hotel after 16:30
      const fb = leave == null ? { m: !via, e: false, n: false } : { m: leave >= 12 * 60 + 30, e: leave >= 16 * 60 + 30, n: leave >= 22 * 60 };
      ["m", "e", "n"].forEach((part) => {
        if (!fb[part]) return;
        const [a, alt] = pick(ctx, part, prev, { near: true });
        if (a) { ctx.used.add(a.id); day.slots.push(activity(ctx, part, a, alt, prev)); prev = a; }
      });
      const back = prev !== hotel ? getThere(prev, hotel, city).text : null;
      const lp = leave == null ? null : partAt(Math.max(leave, 0));
      if (via) day.slots.push(travelSlot(ctx.id, flyId, { toFlight: true, part: lp || "m", leaveBy: leave, collect: back, when: leave == null ? null : "Leave by " + hhmm(leave) }));
      day.slots.push({ part: lp || "e", type: "depart", text: CITIES[flyId].depart, flyOut: flyId, off, flightNo: F.outNo,
        leaveBy: via ? null : leave, collect: via ? null : back, airportMin: AIRPORT_MIN[flyId] || 60,
        when: off == null ? null : (via ? "" : "Leave " + hhmm(leave) + " · ") + "Take-off " + hhmm(off) });
      if (leave != null && leave < 5 * 60) day.earlyFlight = true;
      return day;
    }

    const hadFull = day.slots.some((x) => x.part === "full");
    if (!hadFull && free.e) {
      const restDay = kind === "full" && ctx.prefs.pace === "relaxed" && ctx.prefs.fullTotal % 2 === 0;
      if (restDay) {
        day.slots.push({ part: "e", type: "rest" });
      } else {
        const [b, alt] = pick(ctx, "e", prev, { near: kind !== "full" });
        if (b) { ctx.used.add(b.id); day.slots.push(activity(ctx, "e", b, alt, prev)); prev = b; }
        else day.slots.push({ part: "e", type: "rest" });
      }
    }
    if (free.n) {
      const [c, alt] = pick(ctx, "n", prev, { near: kind !== "full" });
      if (c) { ctx.used.add(c.id); day.slots.push(activity(ctx, "n", c, alt, prev)); prev = c; }
      else day.slots.push({ part: "n", type: "free", text: city.night[(ctx.fullCount + day.slots.length) % city.night.length], eat: { label: "Dinner (halal)", ...eatNear(city, prev.ll) } });
    } else {
      day.slots.push({ part: "n", type: "free", late: true, when: "After check-in", text: "You arrive late: check in, grab a meal near the hotel and rest for tomorrow.", eat: { label: "Late meal near the hotel (halal)", ...eatNear(city, hotelOf(ctx.id).ll) } });
    }
    day.back = prev !== hotel ? getThere(prev, hotel, city) : null;
    return day;
  }

  /* Put the arrival city first, the departure city last, and order the rest by shortest hops */
  function arrangeStops() {
    if (!state.optimise || state.keepOrder || state.stops.length < 2) return false;
    const before = state.stops.map((x) => x.city).join();
    const rest = state.stops.slice();
    const take = (id, fromEnd) => {
      const i = fromEnd ? rest.map((x) => x.city).lastIndexOf(id) : rest.findIndex((x) => x.city === id);
      return i >= 0 ? rest.splice(i, 1)[0] : null;
    };
    const head = state.arrive ? take(state.arrive) : null;
    const tail = state.depart && rest.length ? take(state.depart, true) : null;
    // Try every order of the middle stops (≤ 8, so at most 40,320) and keep the shortest;
    // for longer trips, nearest-neighbour then 2-opt improvement.
    const startId = head ? head.city : state.arrive || null;
    const endId = tail ? tail.city : state.depart || null;
    const leg = (a, b) => (a && b ? km(CITIES[a].stay.ll, CITIES[b].stay.ll) : 0);
    const cost = (seq) => { let c = 0, prevId = startId; seq.forEach((x) => { c += leg(prevId, x.city); prevId = x.city; }); return c + leg(prevId, endId); };
    let best = rest.slice();
    if (rest.length <= 8) {
      let bestCost = Infinity;
      const permute = (arr, k) => {
        if (k === arr.length) { const c = cost(arr); if (c < bestCost) { bestCost = c; best = arr.slice(); } return; }
        for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; permute(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
      };
      permute(rest.slice(), 0);
    } else {
      let cur = startId, pool = rest.slice(), seq = [];
      while (pool.length) { pool.sort((x, y) => leg(cur, x.city) - leg(cur, y.city)); const nx = pool.shift(); seq.push(nx); cur = nx.city; }
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < seq.length - 1; i++) for (let j = i + 1; j < seq.length; j++) {
          const cand = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
          if (cost(cand) < cost(seq) - 1) { seq = cand; improved = true; }
        }
      }
      best = seq;
    }
    const ordered = (head ? [head] : []).concat(best, tail ? [tail] : []);
    state.stops = ordered;
    return ordered.map((x) => x.city).join() !== before;
  }
  let reordered = false;

  /* ---------- form: 1 countries → 2 cities & places → 3 nights → 4 dates & flights → 5 trip style ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  // City <option>s grouped by country (only the chosen countries unless all = true)
  function cityOptions(first, all) {
    const list = all || !state.countries.length ? Object.keys(COUNTRIES) : state.countries;
    return `<option value="">${first}</option>` + list.map((cc) => {
      const cs = Object.entries(CITIES).filter(([, c]) => c.country === cc);
      return cs.length ? `<optgroup label="${esc(COUNTRIES[cc].flag + " " + COUNTRIES[cc].name)}">${cs.map(([id, c]) => `<option value="${id}">${esc(c.name)}</option>`).join("")}</optgroup>` : "";
    }).join("");
  }

  function renderForm() {
    $("#countries").innerHTML = AREAS.map(([a, label]) => `<div class="area"><span class="hint">${esc(label)}</span><div class="types">${Object.entries(COUNTRIES).filter(([, c]) => c.area === a).map(([id, c]) => `<label class="toggle"><input type="checkbox" value="${id}" data-country="${id}" ${state.countries.includes(id) ? "checked" : ""}><span>${c.flag} ${esc(c.name)}</span></label>`).join("")}</div></div>`).join("");
    const cnt = $("#counts");
    if (cnt) cnt.textContent = `${Object.keys(COUNTRIES).length} countries · ${Object.keys(CITIES).length} cities`;
    $("#start").value = state.start || "";
    $("#types").innerHTML = TRIP_TYPES.map((t) => `<label class="toggle"><input type="checkbox" id="type-${t.id}" value="${t.id}" ${state.types.includes(t.id) ? "checked" : ""}><span>${esc(t.label)}</span></label>`).join("") +
      `<label class="toggle"><input type="checkbox" id="type-other" value="other" ${state.other ? "checked" : ""}><span>Other…</span></label>`;
    $("#otherText").hidden = !state.other && !$("#type-other").checked;
    $("#otherText").value = state.other || "";
    $("#wishes").value = state.wishes || "";
    if ($("#reqIn")) $("#reqIn").value = state.requests || "";
    showWishes();
    document.querySelector(`input[name=pace][value=${state.pace}]`).checked = true;
    document.querySelector(`input[name=budget][value=${state.budget}]`).checked = true;
    $("#arriveSel").innerHTML = cityOptions("Same as my first city", true);
    $("#departSel").innerHTML = cityOptions("Same as my last city", true);
    $("#arriveSel").value = state.arrive || "";
    $("#departSel").value = state.depart || "";
    $("#optimise").checked = !!state.optimise;
    $("#audOn").checked = state.aud !== false;
    $("#eurAud").value = state.eurAud;
    const fl = state.flights || {};
    $("#inTime").value = fl.inTime || ""; $("#inNo").value = fl.inNo || "";
    $("#outTime").value = fl.outTime || ""; $("#outNo").value = fl.outNo || "";
    document.querySelector(`input[name=passport][value=${state.passport}]`).checked = true;
    document.querySelector(`input[name=home][value=${state.home}]`).checked = true;
    renderStops();
  }

  // Step 2's picker: a drop-down of the chosen countries' cities plus one-tap suggestions
  function renderCityPicker() {
    $("#citySel").innerHTML = cityOptions(state.countries.length ? "Choose a city…" : "Choose a city (or pick countries above)…");
    const have = new Set(state.stops.map((st) => st.city));
    const q = $("#quickCities");
    if (!state.countries.length) { q.innerHTML = '<p class="hint">Pick the countries you want to visit in step 1 and their cities appear here.</p>'; return; }
    q.innerHTML = state.countries.map((cc) => {
      const cs = Object.entries(CITIES).filter(([id, c]) => c.country === cc && !have.has(id));
      return cs.length ? `<div class="quick"><span class="hint">${COUNTRIES[cc].flag} ${esc(COUNTRIES[cc].name)}:</span>${cs.map(([id, c]) => `<button type="button" class="btn small" data-act="quick" data-city="${id}">+ ${esc(c.name)}</button>`).join("")}</div>` : "";
    }).join("") || '<p class="hint">All the cities we cover in these countries are on your list.</p>';
  }

  function renderStops() {
    const el = $("#stops");
    renderCityPicker();
    if (!state.stops.length) { el.innerHTML = '<p class="hint">No cities yet. Tap a city above to add it.</p>'; renderNights(); renderOutLeg(); return; }
    el.innerHTML = state.stops.map((st, i) => {
      const c = CITIES[st.city];
      const avail = c.places.filter((p) => !st.places.includes(p.id));
      const optOf = (p) => `<option value="${p.id}">${p.insta ? "📸 " : p.custom ? "✳️ " : ""}${esc(p.n)}${p.s.includes("full") ? " (full day)" : ""}${p.r === 3 ? " ★" : ""}</option>`;
      const opts = `<optgroup label="Sights & activities">${avail.filter((p) => !p.insta).map(optOf).join("")}</optgroup>` + (avail.some((p) => p.insta) ? `<optgroup label="📸 Instagram spots">${avail.filter((p) => p.insta).map(optOf).join("")}</optgroup>` : "");
      const chips = st.places.map((id) => {
        const p = c.places.find((x) => x.id === id);
        return p ? `<span class="chip${p.custom ? " own" : ""}">${p.custom ? "✳️ " : p.insta ? "📸 " : ""}${esc(p.n)}<button type="button" data-act="unplace" data-i="${i}" data-id="${id}" aria-label="Remove ${esc(p.n)}">×</button></span>` : "";
      }).join("");
      return `<div class="stop" data-cur="${curOf(st.city)}">
        <div class="stop-head"><span class="num">${pad2(i + 1)}</span><strong>${esc(c.name)}</strong><span class="loc">${ctry(st.city).flag} ${st.nights}N</span>
          <button type="button" class="icon-btn" data-act="up" data-i="${i}" aria-label="Move ${esc(c.name)} earlier" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icon-btn" data-act="down" data-i="${i}" aria-label="Move ${esc(c.name)} later" ${i === state.stops.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="Remove ${esc(c.name)}">✕</button></div>
        ${legRow(st, i)}
        ${hotelRow(st, i)}
        <div class="row"><select id="place-${i}" data-act="place" data-i="${i}" aria-label="Add a place in ${esc(c.name)}"><option value="">Add a place to see…</option>${opts}</select>${ownOpen[st.city] ? "" : `<button type="button" class="btn small" data-act="ownopen" data-i="${i}">➕ Add my own idea</button>`}</div>
        ${ownOpen[st.city] ? ownPlaceForm(st, i) : ""}
        ${tripRow(st, i)}
        ${chips ? `<div class="chips">${chips}<button type="button" class="btn small" data-act="addtop" data-i="${i}" title="Add the top-rated places you haven't picked yet">★ Add top picks</button></div>` : `<p class="hint suggest">No places chosen, so we'll plan the top-rated ones for your trip style, e.g. ${topPicks(st.city, 3).map((p) => esc(p.n.split(/[:(&]/)[0].trim())).join(", ")}${topInsta(st.city, 1).length ? `, plus the photo spot 📸 ${esc(topInsta(st.city, 1)[0].n.split(/[:(]/)[0].trim())}` : ""}. <button type="button" class="btn small" data-act="addtop" data-i="${i}">Add top picks</button></p>`}
      </div>`;
    }).join("");
    renderNights();
    renderOutLeg();
    audifyIn(el);
  }

  // How you get to this stop (from the previous stop, or from the arrival airport): mode + optional times
  function modeSelect(id, fromId, toId, current, extraAttrs) {
    const opts = modesFor(fromId, toId), rec = recommendedMode(fromId, toId);
    return `<select id="${id}" ${extraAttrs} aria-label="How you'll travel from ${esc(CITIES[fromId].name)} to ${esc(CITIES[toId].name)}">
      <option value="">${state.optimise ? `★ Recommend for me (${MODE[rec].label.toLowerCase()})` : "How will you travel? (not chosen)"}</option>
      ${opts.map((m) => `<option value="${m}" ${current === m ? "selected" : ""}>${MODE[m].icon} ${MODE[m].label}${m === rec ? " — recommended" : ""}</option>`).join("")}</select>`;
  }
  function legRow(st, i) {
    const fromId = i > 0 ? state.stops[i - 1].city : state.arrive && state.arrive !== st.city ? state.arrive : null;
    if (!fromId || fromId === st.city) return "";
    const lt = legTimesFor(st, fromId);
    return `<div class="row legrow"><span class="hint lbl">Getting here from ${esc(CITIES[fromId].name)}:</span>
      ${modeSelect("legmode-" + i, fromId, st.city, lt.mode, `data-act="legmode" data-i="${i}" data-from="${fromId}"`)}
      <span class="pair"><label class="hint" for="legdep-${i}">leaves</label><input type="time" id="legdep-${i}" data-act="legdep" data-i="${i}" data-from="${fromId}" value="${esc(lt.dep || "")}"></span>
      <span class="pair"><label class="hint" for="legarr-${i}">arrives</label><input type="time" id="legarr-${i}" data-act="legarr" data-i="${i}" data-from="${fromId}" value="${esc(lt.arr || "")}"></span></div>`;
  }
  /* ---------- "Add my own place": look it up on Wikipedia (description + location), else OpenStreetMap ---------- */
  const ownOpen = {}, ownFound = {};
  function ownPlaceForm(st, i) {
    const c = CITIES[st.city];
    return `<div class="ownplace">
      <b class="hint">Add your own idea in ${esc(c.name)}</b>
      <div class="row"><input type="text" id="ownname-${i}" placeholder="e.g. Day trip to Florence · Lake Como · Sunset at a rooftop · Shakespeare's Globe" aria-label="Your idea" autocomplete="off" value="${esc(ownFound[st.city] || "")}">
        <button type="button" class="btn small print-btn" data-act="ownfind" data-i="${i}">➕ Add</button><button type="button" class="btn small" data-act="ownclose" data-i="${i}">Done</button></div>
      <div class="row ownopts">
        <label class="hint" for="owndur-${i}">Time there</label>
        <select id="owndur-${i}"><option value="auto">From my words</option><option value="1 h">1 hour</option><option value="2 h">2 hours</option><option value="3 h">3 hours</option><option value="4 h">Half day (4 h)</option><option value="full">Full day</option></select>
        <label class="hint" for="ownwhen-${i}">When</label>
        <select id="ownwhen-${i}"><option value="auto">From my words</option><option value="any">Any time</option><option value="m">Morning</option><option value="e">Afternoon</option><option value="n">Evening</option></select>
      </div>
      <div class="hint" id="ownmsg-${i}">${ownMsg[st.city] || "Write it the way you'd say it — a place, a day trip or something to do, with “morning”, “sunset” or “2 hours” if you like. We'll work out where it is, how to get there and where it fits."}</div>
    </div>`;
  }
  const ownMsg = {};
  const fold = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'");
  // When and how long, from words like "sunset", "morning", "2 hours", "half day", "day trip"
  function ideaTiming(t) {
    const x = fold(t);
    let slot = null, h = null;
    if (/day ?trip|full day|whole day|all day/.test(x)) slot = "full";
    else if (/sunset|evening|night|dinner|after dark|blue hour/.test(x)) slot = "n";
    else if (/sunrise|morning|breakfast|early/.test(x)) slot = "m";
    else if (/afternoon|lunch/.test(x)) slot = "e";
    const m = x.match(/(\d+(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\b/);
    if (m) h = m[1] + " h"; else if (/half ?day/.test(x)) h = "4 h"; else if (/(\d+)\s*min/.test(x)) h = x.match(/(\d+)\s*min/)[1] + " min";
    return { slot, h };
  }
  // The "subject" of the idea: drop filler like "day trip to", "visit", "from Milan", timing words
  function ideaSubject(t, fromCity) {
    let x = " " + fold(t) + " ";
    [fold(fromCity.name.replace(/ \(.*\)/, "")), fold(fromCity.local || "")].filter(Boolean).forEach((n) => { x = x.replace(new RegExp("\\b(from|in|near|around)\\s+" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), " "); });
    x = x.replace(/\b(a |an |the )?(full |half |whole )?day ?trips? (to|out to)?|\b(i |we )?(want|would like|'d like|wanna|like) to\b|\b(go|going|visit|visiting|see|seeing|do|doing|check out|take|have|add|include|plan|watch|catch)\b|\b(the )?(sunset|sunrise|morning|afternoon|evening|night|for|at|in the|on the|after dark)\b|\b\d+(\.\d)?\s*(h|hr|hrs|hours?|min|mins|minutes)\b|\bhalf ?day\b|\bfull day\b|\bplease\b/g, " ");
    return x.replace(/\s+/g, " ").replace(/^(to|a|an|the|at|of)\s+/, "").trim();
  }
  // Best way there and back for a day trip between two of our cities
  function dayTripTransport(fromId, toId) {
    const m = recommendedMode(fromId, toId), e = modeEstimate(m, fromId, toId);
    return { m, mins: e.door, text: `${MODE[m].icon} ${MODE[m].label} ${CITIES[fromId].name.replace(/ \(.*\)/, "")} → ${CITIES[toId].name.replace(/ \(.*\)/, "")}, about ${dur(e.ride)} each way (${dur(e.door)} door to door), approx. ${e.cost}. ${firstSentence(routeText(fromId, toId))}` };
  }
  const ownPending = {}, ownResults = {};
  const ideaSay = (i, h) => { const cid = state.stops[i].city; ownMsg[cid] = h; const m = $("#ownmsg-" + i); if (m) m.innerHTML = h; };
  function ideaFinish(i, p, msg) {
    const st = state.stops[i], cid = st.city, c = CITIES[cid];
    if (p.custom) { (state.custom[cid] = state.custom[cid] || []).push(p); syncCustomPlaces(); }
    if (st.places.indexOf(p.id) < 0) st.places.push(p.id);
    ownFound[cid] = "";
    persist(); renderStops();
    ideaSay(i, msg + " Press “Build / update my itinerary” to fit it into your days. Add another idea, or tap Done.");
    toast(`Added to ${c.name}: ${p.n}`);
  }
  // A custom place at a location (or without one); timing from the selectors, else from the words
  function ideaPlace(i, pend, ll, name, d, url, src, how) {
    const c = CITIES[state.stops[i].city], tm = pend.tm;
    const dist = ll ? km(c.stay.ll, ll) : 0, far = dist > 15;
    const xMins = Math.round(((dist * 1.3) / 60) * 60 + 30);
    const slots = tm.slot === "any" ? ["m", "e", "n"] : tm.slot ? [tm.slot] : [far ? "full" : "e"];
    return { id: c.id + "-u" + Date.now().toString(36), custom: true, c: "Check the official website", r: 2, idea: pend.raw,
      n: name, ll: ll || c.stay.ll, d: d || "Your own idea.", url, s: slots, h: tm.h || (far ? Math.max(3, Math.round(10 - (2 * xMins) / 60)) + " h" : "2 h"),
      t: guessTags(name + " " + (d || "")), x: far ? `About ${Math.round(dist)} km from ${c.name.replace(/ \(.*\)/, "")} — check the best train or bus in Google Maps (roughly ${dur(xMins)} each way).` : undefined, xMins: far ? xMins : undefined,
      tip: how === "nopin" ? "No map pin, so travel times are estimated from the city centre. Paste the place's map link or coordinates to make them exact."
        : how === "near" ? `Placed near ${src} — approximate. Paste its map link or coordinates for exact times.`
        : `Your idea${src ? " (found on " + src + ")" : ""} — check opening hours and tickets before you go.` };
  }
  // When nothing is found: copy-the-coordinates tip, put it near a landmark, or add it without a pin
  function ideaFallback(i, pend, intro) {
    const c = CITIES[state.stops[i].city], q = pend.subj || pend.raw;
    ideaSay(i, intro + COORD_TIP + nearPicker(i, "own", c, q) +
      `<button type="button" class="btn small hotelpick" data-act="ownnopin" data-i="${i}">Add “${esc(q)}” without a map pin<br><span class="hint">Times will be estimated from the city centre</span></button>`);
  }
  function addIdea(i) {
    const st = state.stops[i], cid = st.city, c = CITIES[cid];
    const raw = ($("#ownname-" + i).value || "").trim();
    const say = (h) => ideaSay(i, h);
    if (!raw) { $("#ownname-" + i).focus(); return; }
    const tm = ideaTiming(raw), subj = ideaSubject(raw, c), fs = fold(subj);
    // the selectors win over what we read from the words
    const durSel = ($("#owndur-" + i) || {}).value || "auto", whenSel = ($("#ownwhen-" + i) || {}).value || "auto";
    if (durSel === "full") { tm.slot = "full"; tm.h = null; } else if (durSel !== "auto") tm.h = durSel;
    if (whenSel !== "auto" && durSel !== "full") tm.slot = whenSel;
    const pend = (ownPending[i] = { raw, subj, tm });
    const pasted = parseLL(raw);
    const keyOf = (n) => fold(n.split(/[:(&—,]/)[0].replace(/^the /i, "").trim());
    const finish = (p, msg) => ideaFinish(i, p, msg);
    const makeCustom = (o) => Object.assign({ id: cid + "-u" + Date.now().toString(36), custom: true, c: "Check the official website", r: 2, idea: raw }, o);
    if (isShortMapLink(raw)) { ideaFallback(i, pend, SHORT_LINK_HELP); return; }
    if (!fs && !pasted) { say("Tell us a place or activity, e.g. “Day trip to Florence” or “Sunset at Montmartre”."); return; }
    // 1. Another city in the planner → a day trip there
    const wordIn = (k, txt) => new RegExp("(^|[^a-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z])").test(txt);
    let cityHit = pasted ? null : Object.keys(CITIES).filter((id) => id !== cid).find((id) => {
      const k = keyOf(CITIES[id].name), l = CITIES[id].local ? keyOf(CITIES[id].local) : "";
      if (k === "nice" || k === "split") return new RegExp("\\b" + k.charAt(0).toUpperCase() + k.slice(1) + "\\b").test(raw); // ordinary words unless capitalised
      return (k.length > 3 && wordIn(k, fs)) || (l.length > 3 && wordIn(l, fs));
    });
    // …but only when it reads as a trip ("day trip to Florence", "visit Bruges", or just "Florence"), not "Little Venice" in London
    const tripWords = /\b(day ?trip|trip|visit|excursion|outing|go(ing)? to|head(ing)? to|over to|train to|bus to|ferry to|boat to|day in|day at|see)\b/;
    const bare = (x) => keyOf(x).replace(/\b(to|in|the|a|day|for)\b/g, " ").replace(/\s+/g, " ").trim();
    if (cityHit && !tripWords.test(fs) && bare(fs) !== bare(CITIES[cityHit].name.replace(/ \(.*\)/, "")) && !(CITIES[cityHit].local && bare(fs) === bare(CITIES[cityHit].local))) cityHit = null;
    if (cityHit) {
      const T = CITIES[cityHit], tr = dayTripTransport(cid, cityHit), tops = T.places.filter((p) => p.r === 3 && !p.x && !p.insta).slice(0, 3).map((p) => p.n.split(/[:(]/)[0].trim());
      const hours = Math.max(3, Math.round(10 - (2 * tr.mins) / 60));
      const p = makeCustom({ n: "Day trip to " + T.name.replace(/ \(.*\)/, ""), dayCity: cityHit, ll: T.stay.ll, s: ["full"], h: hours + " h", t: ["sightseeing", "culture"], x: tr.text, xMins: tr.mins,
        d: T.intro + (tops.length ? " Highlights: " + tops.join(", ") + "." : ""), c: "Transport " + modeEstimate(tr.m, cid, cityHit).cost + " each way, plus entry fees",
        tip: tops.length ? `With ${hours} h on the ground, pick one or two highlights (${tops.join(", ")}) and book timed tickets ahead.` : "" });
      const long = tr.mins > 240;
      finish(p, `✓ <b>Day trip to ${esc(T.name)}</b> — ${esc(MODE[tr.m].label.toLowerCase())}, about ${esc(dur(tr.mins))} door to door each way, about ${hours} h there.${long ? ` <b>That's a long day</b> — consider adding ${esc(T.name)} as a stop with a night or two instead.` : ""}${state.stops.some((x) => x.city === cityHit) ? ` (${esc(T.name)} is already a stop on your trip.)` : ""}`);
      return;
    }
    // 2. A place we already know — in this city, or elsewhere (then it's a day trip)
    if (!pasted && fs.length >= 4) {
      const pool = [];
      Object.keys(CITIES).forEach((id) => CITIES[id].places.forEach((p) => { if (!p.custom) pool.push({ id, p }); }));
      // every distinctive word you typed must appear in the place's name
      const GENERIC = /^(museum|palace|park|tower|castle|church|cathedral|garden|gardens|square|bridge|lake|town|city|old|new|street|market|beach|view|views|rooftop|hill|spot|place|walk|tour|cruise|river|island|centre|center|great|royal|national|grand|little|with|and)$/;
      const toks = fs.split(/[^a-z0-9']+/).filter((w) => w.length >= 4);
      const distinct = toks.filter((w) => !GENERIC.test(w));
      const matchP = (p) => { const nmf = fold(p.n + " " + (p.loc || "")); const k = keyOf(p.n); return (k.length >= 4 && wordIn(k, fs)) || (distinct.length > 0 && toks.every((w) => nmf.indexOf(w.replace(/'s$/, "")) >= 0)); };
      const hit = pool.filter((o) => matchP(o.p)).sort((a, b) => (a.id === cid ? 0 : 1) - (b.id === cid ? 0 : 1) || (a.p.insta ? 1 : 0) - (b.p.insta ? 1 : 0) || km(c.stay.ll, a.p.ll) - km(c.stay.ll, b.p.ll))[0];
      if (hit && hit.id === cid) { finish(hit.p, `✓ <b>${esc(hit.p.n)}</b> — it's in our ${esc(c.name)} list, so it comes with directions, tips and halal food nearby.`); return; }
      if (hit && km(c.stay.ll, hit.p.ll) < 400) {
        const tr = dayTripTransport(cid, hit.id);
        const p = makeCustom({ n: hit.p.n + " (day trip)", dayCity: hit.id, ll: hit.p.ll, s: ["full"], h: Math.max(3, Math.round(10 - (2 * tr.mins) / 60)) + " h", t: hit.p.t, x: tr.text, xMins: tr.mins, d: hit.p.d, tip: hit.p.tip, c: hit.p.c });
        finish(p, `✓ <b>${esc(hit.p.n)}</b> as a day trip from ${esc(c.name)} — ${esc(MODE[tr.m].label.toLowerCase())}, about ${esc(dur(tr.mins))} each way.`);
        return;
      }
    }
    // 3. Pasted map link or coordinates (the name comes from the link or the words around it)
    if (pasted) {
      if (km(c.stay.ll, pasted) > 400) { say(`That location is ${Math.round(km(c.stay.ll, pasted))} km from ${esc(c.name)} — too far for a day trip. Check the link.`); return; }
      const nm = nameFromLink(raw, "My place (map pin)");
      finish(ideaPlace(i, pend, pasted, nm, "", "", "your map link"), `✓ <b>${esc(nm)}</b> added at the location you pasted.`);
      return;
    }
    // 4. Look it up: Wikipedia (description + location), then OpenStreetMap (pick from the matches)
    say("Looking it up…");
    const cityName = c.name.replace(/ \(.*\)/, "");
    const near = (ll) => ll && km(c.stay.ll, ll) < 400;
    getJSON("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=" + encodeURIComponent(subj + " " + cityName))
      .then((res) => {
        const titles = ((res.query && res.query.search) || []).map((x) => x.title);
        return titles.reduce((chain, title) => chain.then((found) => found || getJSON("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")))
          .then((sm) => (sm.coordinates && near([sm.coordinates.lat, sm.coordinates.lon]) ? { n: sm.title, d: sm.extract || "", ll: [sm.coordinates.lat, sm.coordinates.lon], url: sm.content_urls && sm.content_urls.desktop && sm.content_urls.desktop.page, src: "Wikipedia" } : null))
          .catch(() => null)), Promise.resolve(null));
      })
      .catch(() => null)
      .then((f) => {
        if (f) {
          const p = ideaPlace(i, pend, f.ll, f.n, firstSentence(f.d), f.url, f.src);
          finish(p, `✓ <b>${esc(p.n)}</b> — found on Wikipedia, ${esc(fromCentre(c, f.ll))}${p.x ? " (planned as a day trip)" : ""}.`);
          return;
        }
        geoSearch(c, subj, (rows, why) => {
          if (!rows || !rows.length) { ideaFallback(i, pend, why ? `<p class="hint">${why}</p>` : notFoundMsg(subj, c, "places")); return; }
          if (rows.length === 1) { const r = rows[0]; finish(ideaPlace(i, pend, r.ll, r.name, r.addr, "", "OpenStreetMap"), `✓ <b>${esc(r.name)}</b> — found on OpenStreetMap, ${esc(fromCentre(c, r.ll))}.`); return; }
          ownResults[i] = rows;
          say(`<p class="hint">Pick the right place:</p>` + rows.map((r, k) => `<button type="button" class="btn small hotelpick" data-act="ownpick" data-i="${i}" data-k="${k}"><b>${esc(r.name)}</b><br><span class="hint">${esc(r.addr)} · ${esc(fromCentre(c, r.ll))}</span></button>`).join("") +
            nearPicker(i, "own", c, subj) + `<button type="button" class="btn small hotelpick" data-act="ownnopin" data-i="${i}">None of these — add “${esc(subj)}” without a map pin</button>`);
        });
      });
  }
  // Guess tags from the description so trip style and your wishes apply to it too
  function guessTags(t) {
    const x = String(t).toLowerCase(), out = ["sightseeing"];
    if (/centur|built|histor|ancient|medieval|palace|castle|cathedral|church|fortress|ruins/.test(x)) out.push("history", "culture");
    if (/museum|gallery|art\b|exhibit/.test(x)) out.push("culture");
    if (/park|garden|lake|mountain|forest|beach|waterfall|nature/.test(x)) out.push("nature");
    if (/mosque|islam|ottoman|moorish/.test(x)) out.push("islamic");
    if (/market|shopping|bazaar|mall/.test(x)) out.push("shopping");
    if (/view|panoram|tower|bridge|square/.test(x)) out.push("photo");
    return out.filter((v, k, a) => a.indexOf(v) === k);
  }
  // Which hotel you're staying in: one of our three picks, your own (found on the map), or not decided yet
  const hotelResults = {};
  function hotelRow(st, i) {
    const c = CITIES[st.city], h = state.hotels[st.city] || {}, sel = h.pick || "";
    const set = sel === "custom" && h.ll;
    return `<div class="row hotelrow"><label class="hint lbl" for="hotel-${i}">🏨 Your hotel in ${esc(c.name)}:</label>
      <select id="hotel-${i}" data-act="hotel" data-i="${i}">
        <option value="">Not booked yet — plan from ${esc(c.stay.area)}</option>
        <optgroup label="Our picks">${c.hotels.map((x) => `<option value="${x.tier}" ${sel === x.tier ? "selected" : ""}>${PICK_LABEL[x.tier]}: ${esc(x.n)} · ${esc(priceText(c, x))}</option>`).join("")}</optgroup>
        <option value="custom" ${sel === "custom" ? "selected" : ""}>${set ? "📍 " + esc(h.n) : "Another hotel… (search or map link)"}</option>
      </select>
      ${sel === "custom" ? `<div class="custom-hotel">
        <input type="text" id="hotelq-${i}" placeholder="Hotel name, address or map link" aria-label="Find your hotel in ${esc(c.name)}" autocomplete="off">
        <button type="button" class="btn small" data-act="hotelfind" data-i="${i}">📍 Find</button>
        <div class="hotelres" id="hotelres-${i}" aria-live="polite"></div></div>` : ""}
      ${set ? `<p class="hint hotelset">📍 Planning from <b>${esc(h.n)}</b>${h.src === "near" ? ` (placed near ${esc(h.near)} — approximate; paste its map link or coordinates for exact times)` : ""} · ${esc(fromCentre(c, h.ll))} · <a href="https://www.google.com/maps/search/?api=1&query=${h.ll[0]},${h.ll[1]}" target="_blank" rel="noopener">check the pin ↗</a></p>` : ""}
    </div>`;
  }
  // Coordinates in pasted text: Google "!3d48.85!4d2.29" (exact pin) or "@48.85,2.29", Apple "ll=48.85,2.29", plain "48.85, 2.29"
  function parseLL(t) {
    const str = String(t);
    const m = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      str.match(/[?&](?:q|query|ll|sll|destination|coordinate|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) || str.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    return a > 30 && a < 72 && b > -30 && b < 50 ? [a, b] : null;
  }
  // A place name from a pasted map link: Apple "?q=Name", Google ".../place/Name/@…"; otherwise the text around the link
  function nameFromLink(text, fallback) {
    const t = String(text);
    let m = t.match(/[?&]q=([^&#]+)/);
    if (m) { const v = decodeURIComponent(m[1].replace(/\+/g, " ")).trim(); if (v && !/^[-\d.,\s]+$/.test(v)) return v; }
    m = t.match(/\/place\/([^/@?]+)/);
    if (m) { const v = decodeURIComponent(m[1].replace(/\+/g, " ")).trim(); if (v && !parseLL(v)) return v; }
    const rest = t.replace(/https?:\/\/\S+/g, "").replace(/-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/g, "").trim();
    return rest || fallback;
  }
  // Share links that hide the location behind a redirect a web page can't follow
  const isShortMapLink = (q) => /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\/p\/|share\.google)/i.test(q);
  const COORD_TIP = `<p class="hint"><b>Most reliable:</b> in Google Maps or Apple Maps, press and hold on the exact spot (the hotel's entrance). The coordinates appear, e.g. <i>48.8510, 2.3430</i> — tap to copy them and paste them here. Or open the link in your browser and copy the long address from the address bar.</p>`;
  const SHORT_LINK_HELP = `<p class="hint"><b>That's a short share link</b> (like maps.app.goo.gl/…). It doesn't contain the location — it only points to Google or Apple, and a web page can't follow it. Instead:</p>` + COORD_TIP;
  // Put a hotel or place near a known landmark when it can't be found
  function nearPicker(i, kind, c, q) {
    const opts = [`<option value="stay">${esc(c.stay.area)} (recommended area)</option>`]
      .concat(c.places.filter((p) => !p.custom && !p.x && !p.insta).map((p) => `<option value="${p.id}">${esc(p.n.split(/[:(]/)[0].trim())}</option>`)).join("");
    return `<div class="nearpick"><label class="hint" for="${kind}near-${i}">Or put ${q ? "“" + esc(q) + "”" : "it"} near (approximate):</label>
      <select id="${kind}near-${i}">${opts}</select><button type="button" class="btn small" data-act="${kind}near" data-i="${i}">Use this</button></div>`;
  }
  function nearChoice(i, kind) {
    const c = CITIES[state.stops[i].city], v = $("#" + kind + "near-" + i).value;
    const p = v === "stay" ? null : c.places.find((x) => x.id === v);
    return { ll: p ? p.ll : c.stay.ll, label: p ? p.n.split(/[:(]/)[0].trim() : c.stay.area };
  }
  // Fetch JSON, giving up after 12 s so a slow connection can't leave a lookup hanging
  function getJSON(u) {
    const ctl = window.AbortController ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 12000);
    return fetch(u, Object.assign({ headers: { Accept: "application/json" } }, ctl ? { signal: ctl.signal } : {}))
      .then((r) => { clearTimeout(t); if (!r.ok) throw new Error("http " + r.status); return r.json(); }, (e) => { clearTimeout(t); throw e; });
  }
  // OpenStreetMap search near the city, then a wider search if nothing turns up
  function geoSearch(c, q, cb) {
    const [la, lo] = c.stay.ll;
    const base = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en";
    const near = base + "&bounded=1&viewbox=" + [lo - 0.5, la + 0.35, lo + 0.5, la - 0.35].join(",") + "&q=" + encodeURIComponent(q);
    const wide = base + "&q=" + encodeURIComponent(q + ", " + (c.local || c.name).replace(/ \(.*\)/, "") + ", " + ctry(c.id).name);
    let done = false;
    const finish = (rows, why) => { if (done) return; done = true; cb(rows, why); };
    setTimeout(() => finish(null, "The search took too long."), 15000);
    const get = (u) => fetch(u, { headers: { Accept: "application/json" } }).then((r) => r.json());
    const tidy = (rows) => (rows || []).map((r) => ({ name: r.name || String(r.display_name).split(",")[0], addr: String(r.display_name).split(",").slice(0, 4).join(","), ll: [+r.lat, +r.lon] })).filter((r) => km(r.ll, c.stay.ll) < 80);
    get(near).then((rows) => { const a = tidy(rows); return a.length ? a : new Promise((res) => setTimeout(res, 1100)).then(() => get(wide)).then(tidy); })
      .then((a) => finish(a, null))
      .catch(() => finish(null, "Couldn't reach the map search (it needs an internet connection)."));
  }
  const notFoundMsg = (q, c, what) => `<p class="hint">No match for “${esc(q)}” on OpenStreetMap near ${esc(c.name)}. Many ${what} aren't listed there, or are listed under another name — try the official name, the street address, or paste its map link.</p>`;
  // Save the traveller's own hotel and re-plan straight away
  function setHotel(i, h) {
    const c = CITIES[state.stops[i].city], d = km(h.ll, c.stay.ll);
    if (d > 80) { toast(`That spot is ${Math.round(d)} km from ${c.name}. Check it's the right place, or paste the hotel's map link.`); return; }
    state.hotels[c.id] = Object.assign({ pick: "custom" }, h);
    persist(); renderStops();
    if (d > 25) toast(`Saved, but it's ${Math.round(d)} km from central ${c.name}: double-check the pin.`);
    if (lastPlan) { generate(false); if (d <= 25) toast(`Plan updated: times and directions in ${c.name} now start from ${h.n}.`); }
    else if (d <= 25) toast(`${h.n} saved. Press “Build / update my itinerary” to plan from it.`);
  }
  function findHotel(i) {
    const c = CITIES[state.stops[i].city];
    const q = ($("#hotelq-" + i).value || "").trim();
    const box = $("#hotelres-" + i);
    if (!q) { toast("Type the hotel's name or address, or paste its map link or coordinates."); return; }
    const ll = parseLL(q);
    if (ll) { setHotel(i, { n: nameFromLink(q, "My hotel (map pin)"), ll, area: "map pin", src: "pin" }); return; }
    if (isShortMapLink(q)) { box.innerHTML = SHORT_LINK_HELP + nearPicker(i, "hotel", c, ""); return; }
    box.innerHTML = `<p class="hint">Searching OpenStreetMap near ${esc(c.name)}…</p>`;
    geoSearch(c, q, (rows, why) => {
      if (!rows || !rows.length) { box.innerHTML = (why ? `<p class="hint">${why}</p>` : notFoundMsg(q, c, "hotels")) + COORD_TIP + nearPicker(i, "hotel", c, q); return; }
      hotelResults[i] = rows;
      box.innerHTML = `<p class="hint">Pick your hotel:</p>` + rows.map((r, k) => `<button type="button" class="btn small hotelpick" data-act="hotelpick" data-i="${i}" data-k="${k}"><b>${esc(r.name)}</b><br><span class="hint">${esc(r.addr)} · ${esc(fromCentre(c, r.ll))}</span></button>`).join("") + nearPicker(i, "hotel", c, q);
    });
  }

  // Last leg, when you fly home from a city that isn't your last stop
  function renderOutLeg() {
    const el = $("#outLegRow");
    if (!el) return;
    const last = state.stops.length ? state.stops[state.stops.length - 1].city : null;
    if (!last || !state.depart || state.depart === last) { el.innerHTML = ""; return; }
    const ol = state.outLeg && state.outLeg.from === last ? state.outLeg : {};
    el.innerHTML = `<div class="row legrow"><span class="hint lbl">Getting from ${esc(CITIES[last].name)} to ${esc(CITIES[state.depart].name)} for your flight:</span>
      ${modeSelect("outLegMode", last, state.depart, ol.mode, `data-act="outlegmode" data-from="${last}"`)}</div>`;
  }

  // Step 3: nights in each city, with our suggestion beside each
  function renderNights() {
    const el = $("#nightsList");
    if (!state.stops.length) { el.innerHTML = '<p class="hint">Add cities in step 2 first.</p>'; renderTally(); return; }
    el.innerHTML = state.stops.map((st, i) => {
      const c = CITIES[st.city];
      return `<div class="nrow"><span class="num">${pad2(i + 1)}</span><span class="nname"><b>${flagOf(st.city)} ${esc(c.name)}</b> <span class="hint">we suggest ${c.nightsRec}</span></span>
        <button type="button" class="icon-btn stepper" data-act="nminus" data-i="${i}" aria-label="One night fewer in ${esc(c.name)}" ${st.nights <= 1 ? "disabled" : ""}>−</button>
        <input type="number" id="nights-${i}" min="1" max="30" value="${st.nights}" data-act="nights" data-i="${i}" aria-label="Nights in ${esc(c.name)}">
        <button type="button" class="icon-btn stepper" data-act="nplus" data-i="${i}" aria-label="One more night in ${esc(c.name)}" ${st.nights >= 30 ? "disabled" : ""}>+</button></div>`;
    }).join("") + `<div class="row"><button type="button" class="btn small" data-act="recnights">Use the suggested nights</button></div>`;
    renderTally();
  }

  function renderTally() {
    syncDays();
    const t = $("#tally");
    if (!state.stops.length) { t.className = "tally"; t.innerHTML = "Add a city to start."; return; }
    const nights = state.days - 1;
    const sd = state.start ? new Date(state.start + "T00:00:00") : null;
    const ed = sd ? new Date(sd.getTime() + nights * 86400000) : null;
    const sch = zoneNights().schengen || 0;
    const over = isAU() && sch >= 90;
    t.className = "tally " + (over ? "bad" : "ok");
    t.innerHTML = `<span>${nights} night${nights === 1 ? "" : "s"} → <b>${state.days}-day trip</b></span><span>${sd ? fmtDate(sd) + " – " + fmtDate(ed) : "Add a start date in step 4"}</span>${over ? `<span>Over the Schengen 90-day limit</span>` : ""}`;
  }

  function topPicks(cid, n) {
    const pr = prefsFrom(state), types = pr.types;
    const sc = (p) => (p.r || 1) * 9 + p.t.filter((t) => types.has(t)).length * 8 + wishLabels(p, pr.wish).length * 22;
    return CITIES[cid].places.filter((p) => !p.insta && !wishExcluded(p, pr.wish)).sort((a, b) => sc(b) - sc(a)).slice(0, n);
  }
  // The best photo spots: sunset/golden-hour ones first (they fit evenings), then by trip-style match
  function topInsta(cid, n) {
    const pr = prefsFrom(state);
    const sc = (p) => (p.s.includes("n") ? 3 : 0) + wishLabels(p, pr.wish).length * 2 + (pr.types.has("photo") ? 1 : 0);
    return CITIES[cid].places.filter((p) => p.insta && !wishExcluded(p, pr.wish)).sort((a, b) => sc(b) - sc(a)).slice(0, n);
  }

  function persist() { syncDays(); save("form", state); isExample = false; }

  function readForm() {
    state.start = $("#start").value;
    state.requests = $("#reqIn") ? $("#reqIn").value : state.requests || "";
    state.countries = Array.prototype.map.call(document.querySelectorAll("[data-country]:checked"), (x) => x.value);
    state.types = TRIP_TYPES.map((t) => t.id).filter((id) => $("#type-" + id).checked);
    state.other = $("#type-other").checked ? $("#otherText").value.trim() : "";
    state.wishes = $("#wishes").value.trim();
    state.pace = document.querySelector("input[name=pace]:checked").value;
    state.budget = document.querySelector("input[name=budget]:checked").value;
    state.passport = document.querySelector("input[name=passport]:checked").value;
    state.home = document.querySelector("input[name=home]:checked").value;
    state.arrive = $("#arriveSel").value;
    state.depart = $("#departSel").value;
    state.optimise = $("#optimise").checked;
    state.aud = $("#audOn").checked;
    state.eurAud = Math.max(0.3, Math.min(5, parseFloat($("#eurAud").value) || FX.eurAud));
    state.flights = { inTime: $("#inTime").value, inNo: $("#inNo").value.trim().toUpperCase(), outTime: $("#outTime").value, outNo: $("#outNo").value.trim().toUpperCase() };
    syncDays();
  }

  // Live read-back of what the planner understood from the free text
  function showWishes() {
    const el = $("#wishesRead"), w = parseWishes($("#wishes").value);
    if (!el) return;
    const sum = wishSummary(w);
    el.innerHTML = sum ? `✓ Understood: <b>${esc(sum)}</b>${w.mobility ? " (fewer stairs and hikes, for easier walking)" : ""}. Places you pick yourself are always kept.` : "Examples: “Historical buildings and views, but no museums”, “Lots of nature, no long day trips”, “My mum has bad knees — avoid stairs”.";
  }

  function addCity(id) {
    if (!id || !CITIES[id]) return;
    const cc = CITIES[id].country;
    if (!state.countries.includes(cc)) { state.countries.push(cc); const box = document.querySelector(`[data-country="${cc}"]`); if (box) box.checked = true; }
    state.stops.push({ city: id, nights: CITIES[id].nightsRec || 2, places: [] });
    persist(); renderStops();
    toast(`${CITIES[id].name} added with ${CITIES[id].nightsRec || 2} nights — change them in step 3.`);
  }

  function bindForm() {
    $("#addCity").addEventListener("click", () => {
      const id = $("#citySel").value;
      if (!id) { $("#citySel").focus(); return; }
      $("#citySel").value = "";
      addCity(id);
    });
    $("#planner").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
      const i = +b.dataset.i, act = b.dataset.act;
      if ((act === "up" || act === "down") && state.optimise && !state.keepOrder) { state.keepOrder = true; toast("Your city order is kept; transport is still recommended. Tick the box in step 4 again to re-sort the cities."); }
      if (act === "quick") { addCity(b.dataset.city); return; }
      if (act === "hotelfind") { findHotel(i); return; }
      if (act === "tripadd") { addTrip(i); return; }
      if (act === "tripdel") { state.stops[i].trips.splice(+b.dataset.k, 1); persist(); renderStops(); renderReqPreview(); if (lastPlan) generate(false); return; }
      if (act === "hotelpick") { const r = (hotelResults[i] || [])[+b.dataset.k]; if (r) setHotel(i, { n: r.name, ll: r.ll, area: r.addr, src: "search" }); return; }
      if (act === "hotelnear") { const q = ($("#hotelq-" + i).value || "").trim(), nc = nearChoice(i, "hotel"); setHotel(i, { n: q && !isShortMapLink(q) ? q : "My hotel", ll: nc.ll, area: "near " + nc.label, src: "near", near: nc.label }); return; }
      if (act === "ownopen") { ownOpen[state.stops[i].city] = true; renderStops(); const n = $("#ownname-" + i); if (n) n.focus(); return; }
      if (act === "ownclose") { const cid = state.stops[i].city; ownOpen[cid] = false; delete ownFound[cid]; delete ownMsg[cid]; renderStops(); return; }
      if (act === "ownfind") { addIdea(i); return; }
      if (act === "ownpick") { const r = (ownResults[i] || [])[+b.dataset.k], pend = ownPending[i]; if (r && pend) ideaFinish(i, ideaPlace(i, pend, r.ll, r.name, r.addr, "", "OpenStreetMap"), `✓ <b>${esc(r.name)}</b> added.`); return; }
      if (act === "ownnear") { const pend = ownPending[i]; if (!pend) return; const nc = nearChoice(i, "own"), nm = pend.raw.trim().replace(/^./, (ch) => ch.toUpperCase()); ideaFinish(i, ideaPlace(i, pend, nc.ll, nm, "", "", nc.label, "near"), `✓ <b>${esc(nm)}</b> added near ${esc(nc.label)} (approximate).`); return; }
      if (act === "ownnopin") { const pend = ownPending[i]; if (!pend) return; const nm = pend.raw.trim().replace(/^./, (ch) => ch.toUpperCase()); ideaFinish(i, ideaPlace(i, pend, null, nm, "", "", "", "nopin"), `✓ <b>${esc(nm)}</b> added without a map pin — times are estimated from the city centre.`); return; }
      if (act === "up" && i > 0) [state.stops[i - 1], state.stops[i]] = [state.stops[i], state.stops[i - 1]];
      else if (act === "down" && i < state.stops.length - 1) [state.stops[i + 1], state.stops[i]] = [state.stops[i], state.stops[i + 1]];
      else if (act === "addtop") {
        const st = state.stops[i];
        const add = topPicks(st.city, Math.min(2 + st.nights, 5)).concat(topInsta(st.city, st.nights >= 3 ? 2 : 1)).filter((p) => (!p.s.includes("full") || st.nights > 1) && !st.places.includes(p.id)).map((p) => p.id);
        if (!add.length) { toast(`All the top picks for ${CITIES[st.city].name} are already on your list.`); return; }
        st.places = st.places.concat(add);
        const ig = add.filter((id) => /-ig\d+$/.test(id)).length;
        toast(`Added ${add.length} top pick${add.length > 1 ? "s" : ""} in ${CITIES[st.city].name}${ig ? ` (including ${ig} Instagram spot${ig > 1 ? "s" : ""})` : ""}.`);
      }
      else if (act === "remove") state.stops.splice(i, 1);
      else if (act === "unplace") {
        const cid = state.stops[i].city;
        state.stops[i].places = state.stops[i].places.filter((x) => x !== b.dataset.id);
        if (state.custom[cid] && state.custom[cid].some((p) => p.id === b.dataset.id)) { state.custom[cid] = state.custom[cid].filter((p) => p.id !== b.dataset.id); syncCustomPlaces(); }
      }
      else if (act === "nplus") state.stops[i].nights = Math.min(30, state.stops[i].nights + 1);
      else if (act === "nminus") state.stops[i].nights = Math.max(1, state.stops[i].nights - 1);
      else if (act === "recnights") { state.stops.forEach((st) => (st.nights = CITIES[st.city].nightsRec || 2)); toast("Nights set to our suggestion for each city."); }
      else return;
      persist(); renderStops();
    });
    $("#planner").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.country) {
        readForm();
        if (!t.checked) {
          const gone = state.stops.filter((st) => CITIES[st.city].country === t.value);
          if (gone.length) { state.stops = state.stops.filter((st) => CITIES[st.city].country !== t.value); toast(`Removed ${gone.map((st) => CITIES[st.city].name).join(", ")} with ${COUNTRIES[t.value].name}.`); }
        }
        persist(); renderStops(); return;
      }
      if (t.dataset.act === "hotel") {
        const cid = state.stops[+t.dataset.i].city, c = CITIES[cid], prev = state.hotels[cid] || {};
        if (!t.value) delete state.hotels[cid];
        else if (t.value === "custom") state.hotels[cid] = prev.pick === "custom" ? prev : { pick: "custom", n: "", ll: null };
        else { const h = c.hotels.find((x) => x.tier === t.value); state.hotels[cid] = { pick: h.tier, n: h.n, ll: h.ll, area: h.area }; }
        persist(); renderStops();
        if (t.value && t.value !== "custom") toast(`${state.hotels[cid].n} chosen. Press “Build / update my itinerary” to re-plan ${c.name} from it.`);
        return;
      }
      if (t.id && /^ownname-\d+$/.test(t.id)) { ownFound[state.stops[+t.id.split("-")[1]].city] = t.value; return; }
      if (t.id === "audOn" || t.id === "eurAud") { if (t.id === "eurAud") state.eurAudSet = Math.abs(parseFloat(t.value) - FX.eurAud) > 0.004; readForm(); persist(); renderStops(); if (lastPlan) generate(false); return; }
      if (t.dataset.act === "place" && t.value) { state.stops[+t.dataset.i].places.push(t.value); persist(); renderStops(); return; }
      if (t.dataset.act === "legdep" || t.dataset.act === "legarr" || t.dataset.act === "legmode") {
        const st = state.stops[+t.dataset.i];
        if (!st.leg || st.leg.from !== t.dataset.from) st.leg = { from: t.dataset.from };
        st.leg[t.dataset.act === "legdep" ? "dep" : t.dataset.act === "legarr" ? "arr" : "mode"] = t.value;
        persist(); return;
      }
      if (t.dataset.act === "outlegmode") { state.outLeg = { from: t.dataset.from, mode: t.value }; persist(); return; }
      if (t.dataset.act === "nights") { state.stops[+t.dataset.i].nights = Math.max(1, Math.min(30, parseInt(t.value, 10) || 1)); persist(); renderStops(); return; }
      if (t.id === "arriveSel" || t.id === "departSel" || t.id === "optimise") {
        readForm();
        if (t.id === "optimise") state.keepOrder = false;
        if (arrangeStops()) toast("Cities re-ordered to start and end at your airports.");
        persist(); renderStops(); return;
      }
      if (t.id === "type-other") { $("#otherText").hidden = !t.checked; if (t.checked) $("#otherText").focus(); }
      readForm(); persist(); renderTally();
    });
    $("#reqIn").addEventListener("input", () => { state.requests = $("#reqIn").value; persist(); clearTimeout(reqTimer); reqTimer = setTimeout(renderReqPreview, 350); });
    $("#wishes").addEventListener("input", () => { showWishes(); state.wishes = $("#wishes").value.trim(); persist(); renderStops(); });
    $("#planner").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.id) return;
      const m = e.target.id.match(/^(ownname|hotelq)-(\d+)$/);
      if (m) { e.preventDefault(); if (m[1] === "ownname") addIdea(+m[2]); else findHotel(+m[2]); }
    });
    $("#planner").addEventListener("submit", (e) => {
      e.preventDefault();
      readForm();
      if (!state.stops.length) { toast("Add at least one city first."); $("#citySel").focus(); return; }
      reordered = arrangeStops();
      persist(); renderStops();
      generate(true);
    });
  }

  /* ---------- rendering ---------- */
  let currentTab = load("tab") || "plan";
  let lastPlan = null;

  function fmtDate(d) { return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""; }
  function mapLinks(p, city) {
    const q = encodeURIComponent(p.n.split(/[:(&]/)[0].trim() + " " + city.name);
    return `<div class="maplinks">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">About this place ↗</a>` : ""}<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps ↗</a><a href="https://maps.apple.com/?q=${q}&sll=${p.ll[0]},${p.ll[1]}" target="_blank" rel="noopener">Apple Maps ↗</a></div>`;
  }

  function eatHTML(eat) {
    if (!eat) return "";
    const items = eat.located.map((h) => `<li><b>${esc(h.n)}</b> <span class="dist">${h.d < 1 ? Math.round(h.d * 1000) + " m" : h.d.toFixed(1) + " km"}</span> — ${esc(h.note)}</li>`);
    eat.general.forEach((h) => items.push(`<li><b>${esc(h.n)}</b> — ${esc(h.note)}</li>`));
    if (eat.far) items.push(`<li>Nothing we know of close by: Turkish, Lebanese, Moroccan or Pakistani places often serve halal (ask “halal?”), and seafood or vegetarian dishes are safe fallbacks — ask about wine, lard and gelatine.</li>`);
    return `<div class="eat"><b>${esc(eat.label)}</b><ul>${items.join("")}</ul></div>`;
  }
  const distTxt = (d) => (d < 0.2 ? "right here" : d < 1 ? Math.round(d * 1000) + " m away" : d.toFixed(1) + " km away");
  function photoHTML(ph) {
    if (!ph) return "";
    return `<div class="photo"><b>📸 Photo spot</b><span><b>${esc(ph.n)}</b> <span class="dist">${distTxt(ph.d)}</span> — ${esc(ph.note)}${ph.when ? ` <i>Best: ${esc(ph.when)}.</i>` : ""}</span></div>`;
  }
  // What happens at a border between zones (Schengen, UK, Bosnia & Herzegovina, Türkiye)
  function borderText(a, b) {
    const to = ctry(b).region, au = isAU();
    const t = {
      schengen: au ? "Entering the Schengen Area: your passport is registered in the EU Entry/Exit System (fingerprints and a photo on your first entry). Australians can stay 90 days in any 180 across all Schengen countries combined." : "Entering the Schengen Area: passport control and Entry/Exit System registration (fingerprints and a photo on first entry). Have your Schengen visa ready if you need one.",
      uk: au ? "Entering the UK: you need an approved UK ETA before you travel; Australians can use the eGates." : "Entering the UK: most visitors need a UK ETA or a visa, arranged before you travel.",
      tr: au ? "Entering Türkiye: Australians have been visa-free for up to 90 days in 180 since April 2026 — confirm on Smartraveller. Days here don't count towards your Schengen 90." : "Entering Türkiye: check whether you need an e-Visa (apply only at evisa.gov.tr).",
    }[to] || (REGIONS[to] ? "Entering " + REGIONS[to].name + ": passport check. " + (au ? REGIONS[to].au : REGIONS[to].other) : "");
    return "Passport out. " + t + (ctry(b).cur !== ctry(a).cur ? ` Money changes to ${esc(ctry(b).cur)}.` : "");
  }

  // Side-by-side options for a leg with no mode chosen
  function legOptionsHTML(a, b) {
    const rec = recommendedMode(a, b);
    return `<div class="opts"><table><thead><tr><th>Option</th><th>Door to door</th><th>Approx. cost</th></tr></thead><tbody>
      ${modesFor(a, b).map((m) => { const e = modeEstimate(m, a, b); return `<tr><td>${MODE[m].icon} ${MODE[m].label}${m === rec ? ' <span class="badge top">recommended</span>' : ""}</td><td>${dur(e.door)}</td><td>${esc(e.cost)}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  }

  function slotHTML(s, day) {
    const city = day.city;
    const when = SLOT[s.part];
    const head = `<div class="slot-when"><b>${when.label}</b><span>${esc(s.when || when.time)}</span></div>`;
    let body = "";
    if (s.type === "act") {
      const p = s.p;
      const pc = s.inCity || city;
      body = `${s.inCity ? `<p class="timing"><b>Before you leave ${esc(s.inCity.name)}:</b> check out after breakfast and leave your bags at reception.</p>` : ""}
        <div class="how"><b class="k">${esc(s.how.mode)}</b>${s.how.text}</div>
        <p class="act-name">${esc(p.n)}${p.loc ? `<span class="loc">${esc(p.loc)}</span>` : ""} <span class="badge ${s.why[0]}">${esc(s.why[1])}</span></p>
        <p class="act-desc">${esc(p.d)}</p>
        <div class="kv"><span>Time needed <b>${esc(p.h)}</b></span><span>Cost <b>${esc(p.c)}</b></span>${p.m ? `<span>Nearest stop <b>${esc(p.m)}</b></span>` : ""}</div>
        ${p.tip ? `<p class="tip">${esc(p.tip)}</p>` : ""}
        ${mapLinks(p, pc)}
        ${photoHTML(s.insta)}
        ${s.alt ? `<p class="alt">Prefer something else? <b>${esc(s.alt.n)}</b> — ${esc(s.alt.d.split(". ")[0].replace(/\.$/, ""))}.</p>` : ""}
        ${day.friday && (s.part === "m" || s.part === "full") ? jumuah(pc, p.ll) : ""}
        ${eatHTML(s.eat)}`;
    } else if (s.type === "arrive") {
      const fl = s.flightNo ? `Flight <b>${esc(s.flightNo)}</b> ` : "Your flight ";
      const timing = s.land == null
        ? `<span class="timing">Add your landing time in the form (step 2) and the day is planned around it.</span>`
        : `<span class="timing">${fl}lands at <b>${hhmm(s.land)}</b>. Allow about ${IMMIGRATION} min for immigration and bags.${s.ready != null ? ` With the ~${AIRPORT_MIN[s.flyIn] || 60} min ride into town you'll reach the hotel at about <b>${hhmm(s.ready)}</b>.` : ""}</span>
          ${s.ready != null && s.ready < 14 * 60 ? `<span class="timing">Hotel check-in is usually from 14:00. Ask for early check-in when you book, or leave your bags at reception and head out.</span>` : ""}`;
      body = s.via
        ? `<div class="travel"><b class="k">Land in ${esc(s.city.name)}</b>${timing}${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span></div>`
        : `<div class="travel"><b class="k">Arrive & check in</b>${timing}${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span><span>Check in at <b>${esc(hotelLabel(day.cityId))}</b>, rest, and check your eSIM and transport pass are working.</span></div>`;
    } else if (s.type === "travel") {
      body = `<div class="travel"><b class="k">${s.toFlight ? "To your flight" : s.sameDay ? "Onward the same day" : "Travel day"} · ${flagOf(s.fromId)} ${esc(s.from.name)} → ${flagOf(s.toId)} ${esc(s.to.name)}</b>
        ${s.dep != null ? `<span class="timing">${s.est ? `Estimated${s.leg && !s.leg.chosen ? " (assuming " + MODE[s.leg.rec].label.toLowerCase() + ")" : ""}: departs` : "Departs"} <b>${hhmm(s.dep)}</b>, arrives <b>${hhmm(s.arr)}</b>${s.est ? " — add your booked times in the form for an exact plan" : ""}.${s.leaveBy != null && !s.toFlight ? ` Leave the hotel by <b>${hhmm(s.leaveBy)}</b>.` : ""}</span>` : !s.toFlight ? `<span class="timing">No times entered — add your departure and arrival times on the ${esc(s.to.name)} card in the form for an exact plan.</span>` : ""}
        ${s.toFlight && s.leaveBy != null ? `<span class="timing">To make your flight home, leave ${esc(s.from.name)} by <b>${hhmm(s.leaveBy)}</b> (estimated door to door, with ${INTL_BUFFER / 60} h at the airport).</span>` : ""}
        ${s.collect ? `<span><b>Collect your bags first:</b> ${s.collect}</span>` : ""}
        ${s.toFlight ? `<span>Check out early and leave at least 3 h at the airport before your international flight.</span>` : !s.collect && !s.sameDay ? `<span>Check out after breakfast.</span>` : ""}
        ${s.leg && s.leg.auto
          ? `<span><b>★ Recommended for you: ${MODE[s.leg.chosen].icon} ${MODE[s.leg.chosen].label}.</b> ${esc(s.leg.reason)}</span><span>${esc(s.text)}</span>
             <details class="opts-more"><summary>Compare other options</summary>${legOptionsHTML(s.fromId, s.toId)}<span class="hint">Change it with “Getting here” on the ${esc(s.toFlight ? "“Fly home from” section" : s.to.name + " card")}.</span></details>`
          : s.leg && s.leg.chosen
          ? `<span><b>${MODE[s.leg.chosen].icon} ${MODE[s.leg.chosen].label}:</b> ${esc(s.text)}</span>`
          : `<span><b>How you'll travel isn't chosen yet.</b> Pick it on the ${esc(s.toFlight ? "“Fly home from” section" : s.to.name + " card")} in the form. Until then, timings assume the usual choice (${MODE[(s.leg || {}).rec || "train"].label.toLowerCase()}).</span>${legOptionsHTML(s.fromId, s.toId)}`}
        ${s.border ? `<span><b>Border crossing:</b> ${borderText(s.fromId, s.toId)}</span>` : s.newCountry ? `<span><b>New country:</b> welcome to ${esc(ctry(s.toId).name)} ${ctry(s.toId).flag}. There's no passport control inside the Schengen Area, but carry your passport — spot checks happen (Germany, for example, checks its land borders).${ctry(s.fromId).cur !== ctry(s.toId).cur ? ` Money changes to ${esc(ctry(s.toId).cur)}.` : ""}</span>` : ""}
        ${s.toFlight ? "" : `<span><b>On arrival:</b> ${esc(s.arrive)}</span>
        <span>Check in at <b>${esc(hotelLabel(s.toId))}</b>.</span>`}</div>
        ${s.toFlight || (s.arr != null && s.arr >= 16 * 60) ? "" : eatHTML({ label: s.sameDay || (s.arr != null && s.arr >= 14 * 60) ? "First meal on arrival (halal)" : "Lunch on arrival (halal)", ...eatNear(s.to, hotelOf(s.toId).ll) })}`;
    } else if (s.type === "depart") {
      const fl = s.flightNo ? `Flight <b>${esc(s.flightNo)}</b> ` : "Your flight ";
      const timing = s.off == null
        ? `<span class="timing">Add your take-off time in the form (step 2) and the last day is planned around it.</span>`
        : `<span class="timing">${fl}takes off at <b>${hhmm(s.off)}</b>. Be at the airport by <b>${hhmm(s.off - INTL_BUFFER)}</b>${s.leaveBy != null ? ` — leave the hotel by <b>${hhmm(s.leaveBy)}</b> (about ${s.airportMin} min to the airport)` : ""}.</span>`;
      body = `<div class="travel"><b class="k">Departure</b>${timing}${s.collect ? `<span><b>Collect your bags first:</b> ${s.collect}</span>` : ""}<span>${day.flyOut === day.cityId ? "Check out (usually by 12:00; ask the hotel to hold bags). " : ""}${esc(s.text)}</span>${fromSyd() ? `<span>${sydLine(s.flyOut, "out")}</span>` : ""}${fromSyd() && isAU() ? `<span><b>Landing in Sydney:</b> declare all food, plant and animal products (cheese, cured meats, honey, seeds, nuts). Duty-free allowance: A$900 of goods, 2.25 L alcohol, 25 cigarettes.</span>` : ""}</div>`;
    } else if (s.type === "rest") {
      body = `<p class="act-name">Free time & rest</p><p class="act-desc">Keep this block open: nap, pray, do laundry, or revisit somewhere you liked. A relaxed pace keeps a long trip enjoyable.</p>`;
    } else if (s.type === "free") {
      body = `<p class="act-name">${s.late ? "Late arrival" : "Easy evening"}</p><p class="act-desc">${esc(s.text)}</p>${eatHTML(s.eat)}`;
    }
    return `<div class="slot"${s.type === "act" ? ` data-pid="${s.p.id}"` : ""}>${head}<div class="slot-what">${body}</div></div>`;
  }

  function jumuah(city, ll) {
    const m = city.mosques.filter((x) => x.ll).map((x) => ({ ...x, d: km(ll, x.ll) })).sort((a, b) => a.d - b.d)[0];
    const anyM = m || city.mosques[0];
    if (!anyM) return `<div class="note info"><b class="tag">Jumu'ah</b><span>It's Friday. There's no mosque listed for ${esc(city.name)}; search “mosque” in Google Maps or Muslim Pro, which also has prayer times.</span></div>`;
    const far = m && m.d > 10 ? ` This trip is far from it: to attend Jumu'ah, swap this day with another in ${esc(city.name)}, or pray Dhuhr where you are (travellers' concession).` : " Finish the morning by about 12:00.";
    return `<div class="note info"><b class="tag">Jumu'ah</b><span>It's Friday: ${esc(anyM.n)}${m ? ` (${m.d < 1 ? "a few minutes' walk" : m.d.toFixed(1) + " km away"})` : ""}. The khutbah usually starts around 12:30–13:30; check the time locally.${far}</span></div>`;
  }

  const KIND = { arrival: "Arrival", transfer: "Travel day", full: "", depart: "Departure" };
  function dayTitle(day) {
    const acts = day.slots.filter((s) => s.type === "act").map((s) => s.p.n.split(/[:(]/)[0].trim());
    if (day.kind === "arrival" && day.flyIn !== day.cityId) return `Land in ${CITIES[day.flyIn].name}, on to ${day.city.name}` + (acts.length ? ` · ${acts[0]}` : "");
    if (day.kind === "arrival") return `Arrive in ${day.city.name}` + (acts.length ? ` · ${acts[0]}` : "");
    if (day.kind === "transfer") return `To ${day.city.name}` + (acts.length ? ` · ${acts.join(" & ")}` : "");
    if (day.kind === "depart" && day.flyOut !== day.cityId) return `${day.city.name} → ${CITIES[day.flyOut].name}, then fly home`;
    if (day.kind === "depart") return `Last morning in ${day.city.name}, then home`;
    return acts.join(" · ") || `${day.city.name} at your own pace`;
  }

  /* ---------- the day's timeline: timed, balanced, and editable by the traveller ---------- */
  const TL_ICON = { breakfast: "🍳", sight: "📍", meal: "🍽", cafe: "☕", photo: "📸", shop: "🛍", travel: "🚆", flight: "✈", hotel: "🏨", rest: "🛌", free: "🌙", prayer: "🕌", custom: "✳️" };
  const TL_ADD = [["custom:cafe", "☕ Café / coffee / dessert"], ["custom:meal", "🍽 Restaurant or meal (type a name)"], ["custom:photo", "📸 Photo stop"], ["custom:shop", "🛍 Shopping"], ["custom:rest", "🛌 Rest / free time"], ["custom:custom", "✳️ Something else"]];
  const r5 = (m) => Math.round(m / 5) * 5;
  // "3–4 h" → 3.5, "45 min" → 0.75, "Full day" → 8
  function hoursOf(h) {
    const t = String(h || "").toLowerCase();
    if (/full day/.test(t)) return 8;
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return 1.5;
    const v = nums.length > 1 && /[–-]/.test(t) ? (nums[0] + nums[1]) / 2 : nums[0];
    return /min/.test(t) && !/\bh\b/.test(t) ? v / 60 : v;
  }
  const breakfastNote = (city) => (["tr", "ba"].includes(city.country)
    ? "Breakfast here is halal — try a Turkish or Bosnian spread."
    : "Hotel buffets usually include ham, bacon, salami and pork sausages: stick to eggs, cheese, pastries, yoghurt and fruit, and check sweets and yoghurts for gelatine.");
  const dayKey = (day, i) => `${i}|${day.cityId}|${day.kind}`;

  // Build the suggested timeline for a day from its planned slots
  function buildTimeline(day) {
    const items = [], city = day.city;
    let t = null, ateDinner = false, lastLL = null;
    const shot = new Set();
    const push = (o) => { o.id = "a" + items.length; items.push(o); if (o.ll) lastLL = o.ll; return o; };
    const firstEat = (eat) => (eat && eat.located && eat.located[0]) || null;
    const dinner = (eat) => {
      if (ateDinner) return;
      const ds = r5(Math.max(t || 19 * 60, 18 * 60 + 45));
      // golden-hour photo stop near where you are
      const pool = (city.insta || []).filter((x) => !shot.has(x.n));
      const evening = pool.filter((x) => /sunset|golden|blue hour|night|late afternoon|dusk/i.test(x.when || ""));
      const ph = lastLL ? nearest(evening, lastLL, 3) || nearest(pool.filter((x) => !/morning|sunrise|opening|before/i.test(x.when || "")), lastLL, 2) : null;
      if (t != null && ph && ds - t >= 45) { const ps = r5(t + 10); shot.add(ph.n); push({ k: "photo", title: "Photo stop — " + ph.n, start: ps, end: ps + 30, note: ph.note + (ph.when ? " Best: " + ph.when + "." : ""), ll: ph.ll }); t = ps + 30; }
      if (t != null && ds - t >= 75) push({ k: "shop", title: "Free time — shopping or a stroll nearby", start: r5(t + 10), end: r5(ds - 15), note: "Or head back to the hotel to rest before dinner." });
      const e = firstEat(eat);
      push({ k: "meal", title: e ? "Dinner — " + e.n : "Dinner (halal)", start: ds, end: ds + 60, note: e ? e.note : city.halalTip, ll: e && e.ll });
      t = ds + 60; ateDinner = true;
    };
    day.slots.forEach((s) => {
      if (s.type === "arrive") {
        if (s.land != null) {
          push({ k: "flight", title: `${s.flightNo ? s.flightNo + " lands" : "Flight lands"} in ${s.city.name}`, start: s.land, end: s.land + IMMIGRATION, note: "Immigration, bags and customs." });
          if (!s.via) { push({ k: "hotel", title: `To ${hotelLabel(day.cityId)}`, start: s.land + IMMIGRATION, end: s.ready, note: s.ready < 14 * 60 ? "Check-in is usually from 14:00 — leave your bags at reception." : "Check in." }); t = s.ready; }
          else t = s.land + IMMIGRATION;
        } else { push({ k: "hotel", title: "Arrive, check in and rest", start: 9 * 60, end: 12 * 60 + 30, note: "Add your landing time in step 2 to plan this exactly." }); t = 13 * 60 + 15; }
        return;
      }
      if (s.type === "travel") {
        const mode = (s.leg && (s.leg.chosen || s.leg.assumed)) || "train";
        const e = modeEstimate(mode, s.fromId, s.toId);
        let dep = s.dep, arr = s.arr;
        if (s.toFlight) {
          dep = s.leaveBy != null ? s.leaveBy : r5(Math.max(t || 9 * 60, 9 * 60));
          push({ k: "travel", icon: MODE[mode].icon, title: `${MODE[mode].label}: ${s.from.name} → ${s.to.name} for your flight`, start: dep, end: dep + e.door - 30, note: s.collect ? "Collect your bags from the hotel first." : "" });
          t = dep + e.door - 30;
          return;
        }
        if (dep == null) { dep = r5(Math.max(t || 9 * 60, 8 * 60 + 30) + e.lead); arr = dep + e.door - e.lead - 40; }
        else if (arr == null) arr = dep + e.door - e.lead - 40;
        const leave = s.leaveBy != null ? s.leaveBy : dep - e.lead;
        if (!s.sameDay && e.lead > 0) push({ k: "hotel", title: `Check out${s.collect ? " (collect your bags)" : ""} and go to the ${mode === "flight" ? "airport" : mode === "train" ? "station" : mode === "boat" ? "pier" : "pick-up point"}`, start: leave, end: dep });
        push({ k: "travel", icon: MODE[mode].icon, title: `${MODE[mode].label}: ${s.from.name} → ${s.to.name}`, start: dep, end: arr, note: s.dep == null || s.est ? "Estimated — add your booked times on the " + s.to.name + " card." : "" });
        push({ k: "hotel", title: `Check in — ${hotelLabel(s.toId)}`, start: arr + 20, end: arr + 60 });
        t = arr + 60;
        return;
      }
      if (s.type === "act") {
        const p = s.p, actCity = s.inCity || city, hotel = hotelPoint(actCity);
        const durH = Math.min(hoursOf(p.h), s.part === "full" ? 9 : s.part === "n" ? 2.5 : 4);
        const base = s.inCity ? 9 * 60 : s.part === "full" ? 8 * 60 : s.part === "m" ? 9 * 60 : s.part === "e" ? 13 * 60 + 30 : 19 * 60 + 30;
        if (s.part === "n") dinner(s.eat);
        // travel time from wherever you actually are (hotel, lunch spot, last sight)
        const here = { ll: lastLL || hotel.ll, m: lastLL ? null : hotel.m };
        const g = getThere(here, p, actCity);
        let mins = g.mins != null ? g.mins : 20;
        const far = p.x && km(here.ll, p.ll) > 12;
        if (far) {
          // day trips out of town get their own travel blocks there and back
          const dep = r5(Math.max(t == null ? (s.part === "full" ? 7 * 60 + 30 : base - mins) : t + 5, s.part === "full" ? 7 * 60 + 30 : 0));
          push({ k: "travel", icon: p.dayCity ? "🚆" : "🚐", title: "Travel to " + p.n.replace(/^Day trip to /, "").split(/[:(]/)[0].trim(), start: dep, end: dep + mins, note: firstSentence(p.x) });
          t = dep + mins; mins = 0;
        }
        const start = r5(Math.max(base, (t == null ? base : t) + mins));
        let end = r5(start + durH * 60);
        // an afternoon trip out of town: back at the hotel by about 7:30 pm
        if (far && s.part === "e") end = Math.max(start + 90, Math.min(end, r5(19 * 60 + 20 - (getThere(p, hotel, actCity).mins || 60))));
        if (s.insta) shot.add(s.insta.n);
        if (p.insta) shot.add(p.n);
        push({ k: "sight", title: p.n, start, end, pid: p.id, ll: p.ll, note: far ? (p.dayCity && CITIES[p.dayCity] ? `Halal lunch: ${firstEatName(s.eat) || CITIES[p.dayCity].halalTip}` : s.part === "full" ? "Pack halal snacks and water — options can be limited out here." : "") : `${g.mode} ~${mins} min from the previous stop.`, why: s.why ? s.why[1] : "" });
        t = end;
        if (far) {
          const back = getThere(p, hotel, actCity).mins || mins;
          push({ k: "travel", icon: "🚐", title: "Back to " + actCity.name, start: r5(t + 10), end: r5(t + 10 + back), ll: hotel.ll });
          t = r5(t + 10 + back);
        }
        if (s.part === "m") {
          if (day.friday) {
            const mq = (city.mosques.filter((x) => x.ll).map((x) => ({ x, d: km(p.ll, x.ll) })).sort((a, b) => a.d - b.d)[0] || {}).x || city.mosques[0];
            if (mq) { const ps = r5(Math.max(t + 20, 12 * 60 + 30)); push({ k: "prayer", title: "Jumu'ah — " + mq.n, start: ps, end: ps + 60, note: "Check the khutbah time locally.", ll: mq.ll }); t = ps + 60; }
          }
          const e = firstEat(s.eat);
          const ls = r5(Math.max(t + 10, 11 * 60 + 45));
          push({ k: "meal", title: e ? "Lunch — " + e.n : "Lunch (halal)", start: ls, end: ls + 60, note: e ? e.note : "Pizza, falafel, seafood or a vegetarian dish nearby — or the halal places listed for this city.", ll: e && e.ll });
          t = ls + 60;
        }
        if (s.part === "e" && t <= 17 * 60) {
          const cf = nearest(actCity.cafes, p.ll, 3);
          push({ k: "cafe", title: cf ? "Coffee & cake — " + cf.n : "Coffee or tea break", start: r5(t + 10), end: r5(t + 50), note: cf ? cf.note : "A café near the sight.", ll: cf && cf.ll });
          t = r5(t + 50);
        }
        return;
      }
      if (s.type === "rest") { const st = r5(Math.max(t || 14 * 60, 13 * 60 + 30)); push({ k: "rest", title: "Free time & rest", start: st, end: st + 150, note: "Nap, pray, do laundry or revisit somewhere you liked." }); t = st + 150; return; }
      if (s.type === "free") {
        if (!s.late) dinner(s.eat);
        const st = r5(Math.max(t || 19 * 60 + 30, s.late ? (t || 21 * 60) : 19 * 60 + 30));
        push({ k: s.late ? "hotel" : "free", title: s.late ? "Check in, a late meal and rest" : "Easy evening", start: st, end: st + 90, note: s.text });
        t = st + 90;
        return;
      }
      if (s.type === "depart") {
        if (s.off != null) {
          if (s.leaveBy != null) push({ k: "hotel", title: "Collect your bags and leave for the airport", start: s.leaveBy, end: s.leaveBy + s.airportMin, note: s.collect ? "Back to the hotel first: " + plain(s.collect) : "" });
          push({ k: "flight", title: "At the airport: check in, security and immigration", start: s.off - INTL_BUFFER, end: s.off - 30 });
          push({ k: "flight", title: `${s.flightNo ? s.flightNo + " takes" : "Take"} off — ${CITIES[s.flyOut].name} → home`, start: s.off, end: s.off });
        } else {
          const st = r5(Math.max(t || 12 * 60, 12 * 60));
          push({ k: "hotel", title: "Check out and head to the airport", start: st, end: st + (AIRPORT_MIN[s.flyOut] || 60), note: "Add your take-off time in step 2 to plan this exactly." });
        }
      }
    });
    if (day.back && t != null && !items.some((x) => x.k === "flight" && /off/.test(x.title))) push({ k: "hotel", title: "Back to the hotel", start: r5(t + 5), end: r5(t + 5 + (day.back.mins || 20)), note: plain(day.back.text) });
    // Breakfast before the first planned item (not on arrival day)
    if (day.kind !== "arrival" && items.length) {
      const first = Math.min.apply(null, items.map((x) => x.start));
      if (first >= 7 * 60 + 15) {
        const bs = r5(Math.max(first - 60, 7 * 60));
        push({ k: "breakfast", title: "Breakfast", start: bs, end: Math.max(bs + 30, r5(first - 15)), note: breakfastNote(city) });
      }
    }
    items.forEach((x) => { x.start = Math.round(x.start); x.end = Math.round(Math.max(x.end, x.start)); });
    return items.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  const firstEatName = (eat) => (eat && eat.located && eat.located[0] ? eat.located[0].n : "");
  // The day's timeline: the traveller's edited version if there is one, else the suggestion
  function timelineFor(day, i) {
    const ed = state.edits && state.edits[dayKey(day, i)];
    return ed ? ed.map((x) => Object.assign({}, x)) : day.base ? day.base.map((x) => Object.assign({}, x)) : buildTimeline(day);
  }
  const isEdited = (day, i) => !!(state.edits && state.edits[dayKey(day, i)]);
  function saveTimeline(i, items) {
    const day = lastPlan.days[i];
    state.edits = state.edits || {};
    state.edits[dayKey(day, i)] = items.sort((a, b) => a.start - b.start || a.end - b.end);
    persist();
  }

  let editingDay = null;
  let lastPrintArgs = null;

  function timelineHTML(i) {
    const day = lastPlan.days[i], items = timelineFor(day, i), city = day.city;
    const slotPids = new Set(day.slots.filter((s) => s.type === "act").map((s) => s.p.id));
    const head = `<div class="tl-head"><h5>Your day, hour by hour</h5>${isEdited(day, i) ? '<span class="badge pick">edited by you</span>' : '<span class="hint">suggested — edit anything</span>'}
      ${editingDay === i ? "" : `<button type="button" class="btn small" data-tledit="${i}">✏️ Edit this day</button>`}</div>`;
    if (editingDay === i) return head + timelineEditor(i, items, city);
    let prevEnd = null, prevLL = null;
    const rows = items.map((x) => {
      let pre = "";
      if (prevEnd != null && x.start - prevEnd >= 60) pre = `<li class="tl-gap">Free time · ${dur(x.start - prevEnd)}</li>`;
      const overlap = prevEnd != null && x.start < prevEnd - 1;
      const p = x.pid ? findPlace(city, x.pid) : null;
      const extra = p && !slotPids.has(p.id) ? `<div class="tl-more">${esc(firstSentence(p.d))} <span class="hint">${esc(p.h)} · ${esc(p.c)}${p.m ? " · Metro " + esc(p.m) : ""}</span>${mapLinks(p, city)}</div>` : "";
      const hop = x.ll && prevLL && x.k !== "sight" && x.k !== "travel" && !x.ask ? (() => { const g = getThere({ ll: prevLL }, { ll: x.ll }, city); return g.mins ? ` <span class="hint">· ${esc(g.mode)} ~${g.mins} min</span>` : ""; })() : "";
      prevEnd = Math.max(prevEnd || 0, x.end);
      if (x.ll) prevLL = x.ll;
      return pre + `<li class="tl-item k-${x.k}${overlap ? " overlap" : ""}"><span class="tl-time">${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}</span><span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span>
        <span class="tl-body"><b>${esc(x.title)}</b>${x.why ? ` <span class="badge ${/pick/i.test(x.why) ? "pick" : /top/i.test(x.why) ? "top" : "rec"}">${esc(x.why)}</span>` : ""}${hop}${overlap ? ' <span class="badge pick">overlaps the previous item</span>' : ""}
        ${x.note ? `<span class="tl-note">${esc(x.note)}</span>` : ""}${extra}</span></li>`;
    }).join("");
    return head + `<ol class="tl-list">${rows}</ol>`;
  }
  const findPlace = (city, pid) => city.places.find((p) => p.id === pid);

  function timelineEditor(i, items, city) {
    const day = lastPlan.days[i];
    const used = new Set(items.map((x) => x.pid).filter(Boolean));
    const sights = city.places.filter((p) => !used.has(p.id)).map((p) => `<option value="place:${p.id}">📍 ${esc(p.n.length > 38 ? p.n.split(/[:(]/)[0].trim() : p.n)}${p.r === 3 ? " ★" : ""}</option>`).join("");
    const halal = city.halal.map((h, k) => `<option value="halal:${k}">🍽 ${esc(h.n)}</option>`).join("");
    const cafes = (city.cafes || []).map((h, k) => `<option value="cafe:${k}">☕ ${esc(h.n)}</option>`).join("");
    const photos = (city.insta || []).map((h, k) => `<option value="insta:${k}">📸 ${esc(h.n)}</option>`).join("");
    const rows = items.map((x) => `<div class="tl-row" data-day="${i}" data-id="${x.id}">
        <input type="time" step="300" value="${hhmm(x.start)}" data-tl="start" aria-label="Start time">
        <span aria-hidden="true">–</span>
        <input type="time" step="300" value="${hhmm(x.end)}" data-tl="end" aria-label="End time">
        <span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span>
        <input type="text" value="${esc(x.title)}" data-tl="title" aria-label="What">
        <button type="button" class="icon-btn" data-tldel="${x.id}" aria-label="Remove ${esc(x.title)}">✕</button>
        <input type="text" class="tl-notein" value="${esc(x.note || "")}" data-tl="note" placeholder="Note (optional)" aria-label="Note">
      </div>`).join("");
    const lastEnd = items.length ? Math.max.apply(null, items.map((x) => x.end)) : 9 * 60;
    return `<div class="tl-edit" data-day="${i}">
      <p class="hint">Change times, rename or remove anything, or add your own. Items sort by start time. “Fix overlaps” moves anything that clashes to start after the item before it, keeping each item's length.</p>
      ${rows}
      <div class="tl-add">
        <b>Add to ${esc(city.name)} · ${day.date ? fmtDate(day.date) : "day " + (i + 1)}</b>
        <select id="tlAddWhat-${i}" aria-label="What to add">
          <optgroup label="Sights in ${esc(city.name)}">${sights}</optgroup>
          <optgroup label="Halal food in ${esc(city.name)}">${halal}</optgroup>
          ${cafes ? `<optgroup label="Cafés & desserts">${cafes}</optgroup>` : ""}
          ${photos ? `<optgroup label="Photo spots">${photos}</optgroup>` : ""}
          <optgroup label="Your own">${TL_ADD.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</optgroup>
        </select>
        <input type="text" id="tlAddName-${i}" placeholder="Name (for your own items)" aria-label="Name">
        <span class="pair"><label class="hint" for="tlAddStart-${i}">from</label><input type="time" step="300" id="tlAddStart-${i}" value="${hhmm(Math.min(lastEnd + 15, 22 * 60))}"></span>
        <span class="pair"><label class="hint" for="tlAddEnd-${i}">to</label><input type="time" step="300" id="tlAddEnd-${i}" value=""></span>
        <button type="button" class="btn small" data-tladd="${i}">+ Add</button>
      </div>
      <div class="actions"><button type="button" class="btn small" data-tlflow="${i}">↧ Fix overlaps</button><button type="button" class="btn small" data-tlreset="${i}">↺ Reset day</button><button type="button" class="btn small print-btn" data-tldone="${i}">✓ Done</button></div>
    </div>`;
  }

  // Redraw one day after an edit, plus everything that summarises it
  function refreshDay(i) {
    const el = document.getElementById("tl-" + i);
    if (el) { el.innerHTML = timelineHTML(i); audifyIn(el); }
    const day = lastPlan.days[i];
    const pids = new Set(timelineFor(day, i).map((x) => x.pid).filter(Boolean));
    document.querySelectorAll(`#day-${i + 1} .slot[data-pid]`).forEach((sl) => (sl.hidden = !pids.has(sl.dataset.pid)));
    const g = $("#glanceBox");
    if (g) { g.innerHTML = glanceHTML(lastPlan); audifyIn(g); }
    if (lastPrintArgs) buildPrintView(lastPlan, lastPrintArgs);
  }

  function editTimeline(e) {
    const t = e.target;
    const row = t.closest(".tl-row");
    if (row && t.dataset.tl) {
      const i = +row.dataset.day, items = timelineFor(lastPlan.days[i], i), it = items.find((x) => x.id === row.dataset.id);
      if (!it) return false;
      const f = t.dataset.tl;
      if (f === "start" || f === "end") {
        const m = toMin(t.value);
        if (m == null) return true;
        const len = it.end - it.start;
        if (f === "start") { it.start = m; it.end = m + Math.max(len, 0); } // moving the start moves the whole item
        else it.end = Math.max(m, it.start);
      } else it[f] = t.value;
      if (f === "title") delete it.why;
      saveTimeline(i, items);
      if (f === "start" || f === "end") refreshDay(i);
      else { const g = $("#glanceBox"); if (g) g.innerHTML = glanceHTML(lastPlan); if (lastPrintArgs) buildPrintView(lastPlan, lastPrintArgs); }
      return true;
    }
    return false;
  }

  function clickTimeline(e) {
    const b = e.target.closest("[data-tledit],[data-tldone],[data-tldel],[data-tladd],[data-tlflow],[data-tlreset]");
    if (!b) return false;
    if (b.dataset.tledit != null) { editingDay = +b.dataset.tledit; refreshDay(editingDay); return true; }
    if (b.dataset.tldone != null) { const i = +b.dataset.tldone; editingDay = null; refreshDay(i); toast("Saved. Your changes appear in the summary, printout and offline copy."); return true; }
    const i = +(b.dataset.tladd || b.dataset.tlflow || b.dataset.tlreset || b.closest(".tl-row, .tl-edit").dataset.day);
    const day = lastPlan.days[i], city = day.city;
    let items = timelineFor(day, i);
    if (b.dataset.tldel != null) items = items.filter((x) => x.id !== b.dataset.tldel);
    if (b.dataset.tlflow != null) {
      // keep the order, each item's length and any gaps you left; just push overlapping items later
      let tt = null;
      items.sort((a, b) => a.start - b.start || a.end - b.end).forEach((x) => { const len = x.end - x.start; if (tt != null && x.start < tt && x.k !== "flight") x.start = tt; x.end = x.start + len; tt = Math.max(tt || 0, x.end); });
    }
    if (b.dataset.tlreset != null) {
      delete state.edits[dayKey(day, i)]; state.asks = (state.asks || []).filter((a) => a.key !== dayKey(day, i)); persist(); renderAskHistory(); refreshDay(i); toast("Day reset to the suggested plan."); return true;
    }
    if (b.dataset.tladd != null) {
      const what = $("#tlAddWhat-" + i).value, name = $("#tlAddName-" + i).value.trim();
      const start = toMin($("#tlAddStart-" + i).value);
      if (start == null) { toast("Pick a start time for the new item."); return true; }
      let it;
      if (what.indexOf("place:") === 0) {
        const p = findPlace(city, what.slice(6));
        it = { k: "sight", title: p.n, pid: p.id, ll: p.ll, start, end: start + Math.round(Math.min(hoursOf(p.h), 4) * 60), note: p.tip ? firstSentence(p.tip) : "" };
      } else if (what.indexOf("halal:") === 0) {
        const h = city.halal[+what.slice(6)];
        it = { k: "meal", title: (start < 11 * 60 ? "Breakfast — " : start < 16 * 60 ? "Lunch — " : "Dinner — ") + h.n, ll: h.ll, start, end: start + 60, note: h.note };
      } else if (what.indexOf("cafe:") === 0) {
        const h = city.cafes[+what.slice(5)];
        it = { k: "cafe", title: "Café — " + h.n, ll: h.ll, start, end: start + 45, note: h.note };
      } else if (what.indexOf("insta:") === 0) {
        const h = city.insta[+what.slice(6)];
        it = { k: "photo", title: "Photo stop — " + h.n, ll: h.ll, start, end: start + 30, note: h.note + (h.when ? " Best: " + h.when + "." : "") };
      } else {
        const k = what.split(":")[1];
        const lens = { cafe: 30, meal: 60, photo: 30, shop: 60, rest: 60, custom: 60 };
        const names = { cafe: "Coffee or tea break", meal: "Meal", photo: "Photo stop", shop: "Shopping", rest: "Rest / free time", custom: "My plan" };
        it = { k, title: name || names[k], start, end: start + lens[k], note: name && k !== "custom" ? "" : "" };
      }
      const endIn = toMin($("#tlAddEnd-" + i).value);
      if (endIn != null && endIn > start) it.end = endIn;
      it.id = "u" + Date.now().toString(36);
      items.push(it);
    }
    saveTimeline(i, items);
    refreshDay(i);
    return true;
  }

  // "At a glance": one row per day, built from each day's (possibly edited) timeline
  const stayName = (city) => { const h = hotelOf(city.id); return h.chosen ? h.n : city.stay.area; };
  /* ---------- "Change my plan": type a request, see it worked out, add it to the day ---------- */
  // Plain-text understanding runs in the page (works offline, on GitHub Pages and in the standalone file).
  // On the claude.ai page, requests it can't read can also be sent to Claude, which returns the same command.
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const WEEKDAY = [/\bsun(day)?\b/, /\bmon(day)?\b/, /\btue(s|sday)?\b/, /\bwed(nesday)?\b/, /\bthu(rs|rsday)?\b/, /\bfri(day)?\b/, /\bsat(urday)?\b/];
  const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const GENERIC = new Set("the and with from town city mountain mountains church cathedral basilica chapel castle fortress fort park museum gallery street old lake river tower towers palace great national scenic area night market view bridge garden gardens hall road west east north south ancient centre center square piazza plaza place new tour trip visit day half full quarter harbour harbor beach island islands house art city's st saint santa san".split(" "));
  const norm = (s) => fold(String(s || "")).replace(/['`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const MEAL_WIN = { breakfast: [7 * 60 + 30, 8 * 60 + 30], lunch: [12 * 60, 13 * 60], dinner: [18 * 60 + 30, 19 * 60 + 30] };
  const PART_WIN = { morning: [9 * 60, 12 * 60 + 30], afternoon: [13 * 60 + 30, 17 * 60 + 30], evening: [17 * 60, 21 * 60 + 30], night: [19 * 60, 22 * 60], "half day": [13 * 60, 18 * 60], "full day": [8 * 60, 18 * 60 + 30] };

  // "5pm", "5:30 pm", "17:00", "10" → {m, ap}
  function clockOf(str) {
    const m = String(str).trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if (!m) return null;
    let h = +m[1];
    const min = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : null;
    if (h > 23 || min > 59) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return { m: h * 60 + min, ap, bare: !ap && !m[2] };
  }
  // A bare hour like "5" or "10" means the afternoon/evening unless it's 8–11
  const settle = (c, other) => {
    if (!c || c.ap || c.m >= 12 * 60) return c;
    if (other && other.ap === "p" && c.m + 720 < other.m + (other.m < 12 * 60 ? 720 : 0)) return Object.assign({}, c, { m: c.m + 720 });
    if (c.m < 8 * 60) return Object.assign({}, c, { m: c.m + 720 });
    return c;
  };

  // Which day of the trip the request is about
  function parseDay(t, plan) {
    const days = plan.days;
    const byDate = (y, mo, d) => days.findIndex((x) => x.date && x.date.getMonth() === mo && x.date.getDate() === d && (y == null || x.date.getFullYear() === y));
    let m = t.match(/\bday\s*(\d{1,2})\b/);
    if (m) { const i = +m[1] - 1; return { i: i >= 0 && i < days.length ? i : -1, said: "day " + m[1], cut: m[0] }; }
    m = t.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?" + MON_RE + "\\b(?:\\s+(\\d{4}))?")) || null;
    let mm = t.match(new RegExp("\\b" + MON_RE + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?"));
    if (m || mm) {
      const d = m ? +m[1] : +mm[2], mo = MON[(m ? m[2] : mm[1]).slice(0, 3)], y = (m ? m[3] : mm[3]) ? +(m ? m[3] : mm[3]) : null;
      if (!days[0].date) return { i: -2, said: (m || mm)[0], cut: (m || mm)[0] };
      return { i: byDate(y, mo, d), said: (m || mm)[0], cut: (m || mm)[0] };
    }
    m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      if (!days[0].date) return { i: -2, said: m[0], cut: m[0] };
      return { i: byDate(m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null, +m[2] - 1, +m[1]), said: m[0], cut: m[0] };
    }
    m = t.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m) {
      if (!days[0].date) return { i: -2, said: m[0], cut: m[0] };
      return { i: days.findIndex((x) => x.date.getDate() === +m[1]), said: m[0], cut: m[0] };
    }
    if (/\b(first|arrival) day\b/.test(t)) return { i: 0, said: "the first day" };
    if (/\b(last|final|departure) day\b/.test(t)) return { i: days.length - 1, said: "the last day" };
    for (let w = 0; w < 7; w++) {
      if (WEEKDAY[w].test(t)) {
        if (!days[0].date) return { i: -2, said: t.match(WEEKDAY[w])[0] };
        return { i: days.findIndex((x) => x.date.getDay() === w), said: t.match(WEEKDAY[w])[0] };
      }
    }
    return null;
  }

  // Start/end times, a length ("4 hr"), or a part of the day
  function parseTimes(t) {
    const out = { start: null, end: null, len: null, part: null };
    let s = " " + t.replace(/\b(onwards?|o'?clock|ish|approx(imately)?|around|about|roughly)\b/g, " ") + " ";
    const lm = s.match(/\b(\d+(?:\.\d+)?|half an?|an?|one|two|three|four|five|six|seven|eight)\s*-?\s*(h|hr|hrs|hour|hours)\b/);
    if (lm) { out.len = Math.round((/half/.test(lm[1]) ? 0.5 : NUMW[lm[1]] || parseFloat(lm[1])) * 60); s = s.replace(lm[0], " "); }
    const mn = s.match(/\b(\d{2,3})\s*(min|mins|minutes)\b/);
    if (mn && !out.len) { out.len = +mn[1]; s = s.replace(mn[0], " "); }
    const T = "(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)";
    const rg = s.match(new RegExp("(?:from|between|starting(?: at)?|at)?\\s*" + T + "\\s*(?:-|–|—|to|till|til|until|and|through)\\s*" + T + "(?![\\d/])"));
    let a = null, b = null;
    if (rg) { a = clockOf(rg[1]); b = clockOf(rg[2]); if (a && b && (a.ap || b.ap || !a.bare || !b.bare || /from|between|till|until/.test(rg[0]))) { a = settle(a, b); b = settle(b, a); if (b.m <= a.m && !b.ap && b.m + 720 < 1440) b = Object.assign({}, b, { m: b.m + 720 }); } else { a = b = null; } }
    if (!a) {
      const sm = s.match(new RegExp("\\b(?:from|at|starting(?: at)?|start at|leave at|leaving at)\\s+" + T + "(?![\\d/])")) || s.match(/\b(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))\b/);
      if (sm) a = settle(clockOf(sm[1]));
      const em = s.match(new RegExp("\\b(?:till|til|until|to|by|back by|finish(?:ing)? (?:at|by))\\s+" + T + "(?![\\d/])"));
      if (em) b = settle(clockOf(em[1]), a);
      if (a && b && b.m <= a.m) b = null;
    }
    if (a) out.start = a.m;
    if (b) out.end = b.m;
    if (/\bfull[ -]?day\b|\bwhole day\b|\bday[ -]?trip\b|\ball day\b/.test(t)) out.part = "full day";
    else if (/\bhalf[ -]?day\b/.test(t)) out.part = "half day";
    else if (/\bmorning\b/.test(t)) out.part = "morning";
    else if (/\bafternoon\b/.test(t)) out.part = "afternoon";
    else if (/\b(evening|sunset)\b/.test(t)) out.part = "evening";
    else if (/\b(night|tonight|after dark)\b/.test(t)) out.part = "night";
    return out;
  }

  // Cities named in the text, in the order they appear
  // Names for a city: "Ljubljana & Lake Bled" → ljubljana, lake bled; "Malta (Valletta)" → malta, valletta; plus the local name (Roma, Firenze)
  function cityNames(c) {
    const base = c.name.replace(/\s*\(.*\)/, ""), paren = (c.name.match(/\(([^)]+)\)/) || [])[1];
    const out = [norm(base)].concat(base.split(/\s*&\s*/).map(norm));
    if (paren && /^[A-Z]/.test(paren)) out.push(norm(paren));
    if (c.local) out.push(norm(c.local));
    return out.filter((v, k, a) => v && a.indexOf(v) === k);
  }
  function citiesIn(t, raw) {
    const found = [];
    Object.keys(CITIES).forEach((id) => {
      const c = CITIES[id];
      cityNames(c).forEach((n) => {
        if (!n || n.length < 3) return;
        // "nice" and "split" are ordinary words unless written with a capital
        if ((n === "nice" || n === "split") && !(raw && new RegExp("\\b" + n.charAt(0).toUpperCase() + n.slice(1) + "\\b").test(raw))) return;
        const at = (" " + t + " ").indexOf(" " + n + " ");
        if (at >= 0 && !found.some((f) => f.id === id)) found.push({ id, at, n });
      });
    });
    return found.sort((x, y) => x.at - y.at);
  }

  // How well a name matches the text: distinctive words count most
  function nameScore(name, local, t) {
    if (local) { const z = norm(local); if (z.length > 5 && (" " + t + " ").indexOf(" " + z + " ") >= 0) return 100; }
    const main = norm(String(name).split(/[:(—–&]/)[0]);
    if (main.length > 5 && (" " + t + " ").indexOf(" " + main + " ") >= 0) return 50 + main.length;
    const words = main.split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w));
    let score = 0, distinct = 0, generic = 0;
    words.forEach((w) => {
      if ((" " + t + " ").indexOf(" " + w + " ") < 0 && !(w.length >= 6 && t.indexOf(w) >= 0)) return;
      if (GENERIC.has(w)) { generic++; score += 1; } else { distinct++; score += w.length; }
    });
    return distinct ? score : generic >= 2 ? score : 0;
  }
  function bestPlace(t, cityIds) {
    let best = null;
    cityIds.forEach((cid, rank) => {
      CITIES[cid].places.forEach((p) => {
        const sc = nameScore(p.n, p.loc, t) - rank * 0.5;
        if (sc >= 5 && (!best || sc > best.score)) best = { p, cid, score: sc };
      });
    });
    return best;
  }
  function bestHalal(t, city) {
    let best = null;
    city.halal.forEach((h, k) => { const sc = nameScore(h.n, null, t); if (sc >= 5 && (!best || sc > best.score)) best = { h, k, score: sc }; });
    return best;
  }

  // Read a request into a command; never throws
  function parseAsk(text, plan) {
    const raw = String(text || "").trim();
    const t = norm(raw.replace(/(\d)[.](\d{2})\b/g, "$1:$2")).replace(/(\d) (\d{2}) ?(am|pm)?\b/g, (all, h, mi, ap) => h + ":" + mi + (ap ? ap : ""));
    const tt = raw.toLowerCase().replace(/[’']/g, "");
    const cmd = { raw, action: null, day: null, start: null, end: null, len: null, part: null, city: null, from: null, pid: null, halal: null, mode: null, title: null, meal: null, said: {} };
    if (!t) return cmd;
    const d = parseDay(tt, plan);
    if (d) { cmd.day = d.i; cmd.said.day = d.said; }
    const tm = parseTimes(tt.replace(d && d.cut ? d.cut : "\u0000", " "));
    Object.assign(cmd, { start: tm.start, end: tm.end, len: tm.len, part: tm.part });
    if (/\b(high[ -]?speed|train|rail|eurostar|tgv|ice|frecciarossa)\b/.test(t)) cmd.mode = "train";
    else if (/\b(car|hire car|rental|taxi|uber|bolt|driver|drive|cab)\b/.test(t)) cmd.mode = "car";
    else if (/\b(bus|coach|minibus)\b/.test(t)) cmd.mode = "bus";
    else if (/\b(ferry|boat|cruise)\b/.test(t)) cmd.mode = "boat";
    else if (/\b(fly|flight|plane)\b/.test(t)) cmd.mode = "flight";
    if (/\bbreakfast\b/.test(t)) cmd.meal = "breakfast"; else if (/\blunch\b/.test(t)) cmd.meal = "lunch"; else if (/\b(dinner|supper)\b/.test(t)) cmd.meal = "dinner";
    const remove = /\b(remove|delete|cancel|drop|skip|take out|get rid of|dont want|do not want|no more)\b/.test(t);
    const free = /\b(free time|free|rest|relax|chill|nap|nothing planned|keep .* free|downtime|day off)\b/.test(t);
    const cs = citiesIn(t, raw);
    const fromM = t.match(/\bfrom ([a-z ]+?)(?: to | into | for |$)/);
    if (fromM) { const fc = citiesIn(fromM[1], raw)[0]; if (fc) cmd.from = fc.id; }
    // the day decides where you're starting from, unless the text says otherwise
    let dayIdx = cmd.day != null && cmd.day >= 0 ? cmd.day : null;
    const others = cs.filter((c) => c.id !== cmd.from);
    if (cmd.day == null && (others.length || cmd.from)) {
      // no date: use a full day in the city you'd start from (or the nearest stop)
      const base = cmd.from || nearestStop(plan, others.length ? others[others.length - 1].id : cmd.from);
      dayIdx = pickDay(plan, base, others.length ? others[others.length - 1].id : null);
      if (dayIdx != null) { cmd.day = dayIdx; cmd.said.day = "auto"; }
    }
    const here = dayIdx != null ? plan.days[dayIdx].cityId : null;
    const destC = others.filter((c) => c.id !== here).pop();
    const searchIds = [destC ? destC.id : here].concat(Object.keys(CITIES).filter((id) => id !== (destC ? destC.id : here) && plan.stops.some((s) => s.id === id))).filter(Boolean);
    const bp = bestPlace(t, searchIds);
    if (remove) {
      cmd.action = "remove";
      cmd.title = raw.replace(/^(please\s+)?(remove|delete|cancel|drop|skip|take out|get rid of)\s+/i, "").replace(/\b(on|from)\b.*$/i, "").trim();
      return cmd;
    }
    if (bp) { cmd.pid = bp.p.id; cmd.city = bp.cid; }
    else if (destC) cmd.city = destC.id;
    if (cmd.city && cmd.city !== here) cmd.action = "outing";
    else if (cmd.pid) cmd.action = "place";
    else if (here) {
      const bh = bestHalal(t, CITIES[here]);
      if (bh && (cmd.meal || /\b(eat|food|restaurant|halal|noodle|meal)\b/.test(t))) { cmd.action = "meal"; cmd.halal = bh.k; cmd.meal = cmd.meal || "dinner"; }
      else if (cmd.meal) cmd.action = "meal";
      else if (free) cmd.action = "free";
    }
    if (!cmd.action && (cmd.start != null || cmd.part) && dayIdx != null) {
      cmd.action = "custom";
      cmd.title = cleanTitle(raw, d);
    }
    return cmd;
  }
  // "Add a cooking class on day 3 from 2 to 4pm" → "Cooking class"
  function cleanTitle(raw, d) {
    let x = " " + raw + " ";
    if (d && d.said && d.said !== "auto") x = x.split(d.said).join(" ").split(d.said.replace(/^./, (c) => c.toUpperCase())).join(" ");
    x = x.replace(/\b(from|between|at|till|until|to|by|and|starting)?\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?(\s*(-|–|to|till|until|and)\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?)?\b/gi, " ")
      .replace(/\b(please|add|put|include|schedule|book|i want to|i'd like to|id like to|can you|could you|on|in the|onwards?|morning|afternoon|evening|tonight|night)\b/gi, " ")
      .replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : "My plan";
  }
  // A place's tip, unless it's about going early and the visit is later in the day
  const tipFor = (p, st) => (p.tip && !(st >= 12 * 60 && /\b(go early|early morning|before (about )?\d|at opening|morning)\b/i.test(firstSentence(p.tip))) ? firstSentence(p.tip) : "");
  // The stop nearest a city (for requests that don't give a date)
  function nearestStop(plan, cid) {
    if (!cid) return null;
    const ids = plan.stops.map((s) => s.id);
    if (ids.indexOf(cid) >= 0) return cid;
    return ids.slice().sort((a, b) => km(CITIES[a].stay.ll, CITIES[cid].stay.ll) - km(CITIES[b].stay.ll, CITIES[cid].stay.ll))[0];
  }
  // A day based in `base`: prefer full days with the fewest sights
  function pickDay(plan, base, dest) {
    let best = null;
    plan.days.forEach((d, i) => {
      if (d.cityId !== base || d.kind === "depart") return;
      const sights = timelineFor(d, i).filter((x) => x.k === "sight").length;
      const score = (d.kind === "full" ? 0 : 5) + sights;
      if (dest === base) return;
      if (!best || score < best.score) best = { i, score };
    });
    return best ? best.i : null;
  }

  /* ---------- working the command out against the day ---------- */
  const FIXED = (x) => x.k === "flight" || (x.k === "travel" && /→/.test(x.title) && !x.ask);
  // Travel there and back for one mode, from the hotel
  function outingLeg(mode, A, B, hotel) {
    const key = A.id + "|" + B.id, o = OUTINGS[key];
    if (mode === "train" && o && o.train) {
      const tr = o.train, toSt = getThere(hotel, { n: tr.from.n, ll: tr.from.ll }, A);
      const acc = Math.max(10, toSt.mins || 0);
      return { mode, out: acc + tr.wait + tr.ride + tr.to.mins, back: tr.to.mins + 15 + tr.ride + acc, ride: tr.ride, lastBack: toMin(tr.lastBack), lastOut: toMin(tr.lastOut), firstOut: toMin(tr.firstOut), acc, tr,
        cost: `${tr.fare} train each way${tr.to.fare ? " + " + tr.to.fare + " into town" : ""}`,
        outText: `${toSt.mode || "Metro or taxi"} ~${acc} min to ${tr.from.n}, be there ${tr.wait} min early, train ~${tr.ride} min to ${tr.to.n}${tr.to.mins ? `, then ~${tr.to.mins} min into town` : ""}.`,
        note: tr.note };
    }
    if (mode === "train" && !modesFor(A.id, B.id).includes("train")) return null;
    if (mode === "car" && o && o.car) {
      const e = modeEstimate("car", A.id, B.id);
      return { mode, out: o.car.mins, back: o.car.mins, ride: o.car.mins, cost: e.cost + " each way", outText: `By car, about ${dur(o.car.mins)} each way.`, note: o.car.note };
    }
    if (modesFor(A.id, B.id).indexOf(mode) < 0) return null;
    const e = modeEstimate(mode, A.id, B.id);
    // short train hops: less time at the stations than an intercity journey (incl. border checks where there are any)
    if (mode === "train" && km(A.stay.ll, B.stay.ll) < 200) e.door = 30 + Math.max(15, e.ride) + 20 + (crossesBorder(A.id, B.id) ? 15 : 0);
    return { mode, out: e.door, back: e.door, ride: e.ride, cost: e.cost + " each way", outText: firstSentence(String(modeText(mode, A.id, B.id)).replace(/<[^>]+>/g, "")), note: "" };
  }

  // The way to go: the mode asked for, else the quickest — or the train when it's nearly as quick (far cheaper)
  function chooseLeg(A, B, hotel, asked) {
    const cands = [];
    // no flying for a day out unless asked
    ["train", "car", "bus", "boat", "flight"].forEach((m) => { if (m === "flight" && asked !== "flight") return; const L = outingLeg(m, A, B, hotel); if (L) cands.push(L); });
    if (!cands.length) return null;
    cands.sort((x, y) => x.out + x.back - (y.out + y.back));
    // a hire car for one day (hire, fuel, parking, an International Driving Permit) only when there's no train, coach or ferry, or it was asked for
    const pub = cands.filter((c) => c.mode !== "car"), pool = pub.length ? pub : cands;
    const train = pool.find((c) => c.mode === "train");
    const L = (asked && cands.find((c) => c.mode === asked)) || (train && train.out + train.back <= pool[0].out + pool[0].back + 40 ? train : pool[0]);
    return { L, other: cands.find((c) => c.mode !== L.mode), cands };
  }

  // Everything needed to show (and then add) the change; nothing is saved here
  function workOut(cmd, plan, baseItems) {
    const r = { ok: false, cmd, items: [], removed: [], trimmed: [], notes: [], warns: [], alts: [], summary: "" };
    if (!cmd.action) { r.err = "nothing"; return r; }
    if (cmd.day === -2) { r.err = "Add a start date in step 4 to plan by date — or say “day 7” instead."; return r; }
    if (cmd.day == null || cmd.day < 0) {
      if (cmd.day === -1) { r.err = `${cmd.said.day ? "“" + cmd.said.day + "” isn't" : "That day isn't"} one of your trip days (${fmtDate(plan.days[0].date)} – ${fmtDate(plan.days[plan.days.length - 1].date)}).`; return r; }
      r.err = "Which day? Add a date (e.g. “on 28 Dec”) or a day number (“day 7”).";
      return r;
    }
    const i = cmd.day, day = plan.days[i], A = day.city, hotel = hotelPoint(A);
    r.i = i;
    const items = baseItems || timelineFor(day, i);
    r.where = `Day ${i + 1}${day.date ? " · " + fmtDate(day.date) : ""} · ${A.name}`;
    if (cmd.said.day === "auto") r.notes.push(`No date given, so I picked day ${i + 1}${day.date ? " (" + fmtDate(day.date) + ")" : ""} in ${A.name}. Add a date to choose another.`);
    if (cmd.from && cmd.from !== A.id) r.warns.push(`On day ${i + 1} you're staying in ${A.name}, not ${CITIES[cmd.from].name}, so this is planned from ${A.name}.`);

    const make = (o) => Object.assign({ ask: 1 }, o);
    if (cmd.action === "remove") {
      const q = norm(cmd.title);
      const hit = items.filter((x) => !FIXED(x) && q && (norm(x.title).indexOf(q) >= 0 || nameScore(x.title, null, q) >= 5 || nameScore(q, null, norm(x.title)) >= 5));
      if (!hit.length) { r.err = `I couldn't find “${cmd.title}” on day ${i + 1}. That day has: ${items.filter((x) => !FIXED(x)).map((x) => x.title).join(" · ")}.`; return r; }
      r.removed = hit; r.start = Math.min.apply(null, hit.map((x) => x.start)); r.end = Math.max.apply(null, hit.map((x) => x.end));
      r.summary = `Remove ${hit.map((x) => "“" + x.title + "”").join(", ")} from day ${i + 1}`;
      r.ok = true;
      return r;
    }
    // the time window
    let s = cmd.start, e = cmd.end;
    const win = cmd.part ? PART_WIN[cmd.part] : cmd.meal ? MEAL_WIN[cmd.meal] : null;
    const defLen = cmd.action === "outing" ? null : cmd.action === "place" ? Math.round(Math.min(hoursOf(findPlace(CITIES[cmd.city || A.id], cmd.pid).h), 4) * 60) : cmd.action === "meal" ? 60 : cmd.action === "free" ? 120 : 60;
    if (s == null && e == null && win) { s = win[0]; e = win[1]; if (cmd.len && cmd.part) e = s + cmd.len; }
    if (s != null && e == null) e = cmd.len ? s + cmd.len : cmd.part && win[1] > s ? win[1] : defLen ? s + defLen : null;
    if (s == null && e == null && cmd.action === "place") {
      // a place with no time: its best time of day (full-day trips start early)
      const P = findPlace(A, cmd.pid), best = (P.s || ["m"])[0];
      s = best === "full" ? 8 * 60 : best === "e" ? 13 * 60 + 30 : best === "n" ? 19 * 60 + 30 : 9 * 60;
      e = best === "full" ? 18 * 60 : s + defLen;
      r.notes.push(`No time given, so it's planned ${best === "full" ? "as a full-day trip" : best === "e" ? "for the afternoon" : best === "n" ? "for the evening" : "for the morning"} — the best time for it. Add a time to move it.`);
    }
    if (s == null && e != null) s = cmd.len ? e - cmd.len : defLen ? e - defLen : null;
    if (cmd.action === "outing" && (s == null || e == null)) {
      // an outing with no time: half a day in the afternoon, or what fits the length asked for
      s = s != null ? s : 13 * 60;
      e = e != null ? e : s + (cmd.len || 5 * 60);
      r.notes.push(`No time given, so this starts at ${hhmm(s)}. Say “from 9am” or “in the evening” to move it.`);
    }
    if (s == null) {
      // place or meal with no time: the first gap long enough, else the evening
      const need = defLen || 60, sorted = items.slice().sort((a, b) => a.start - b.start);
      let t0 = 9 * 60;
      for (let k = 0; k <= sorted.length; k++) {
        const nxt = k < sorted.length ? sorted[k].start : 22 * 60;
        if (nxt - t0 >= need + 20 && t0 >= 9 * 60) { s = r5(t0 + 10); break; }
        if (k < sorted.length) t0 = Math.max(t0, sorted[k].end);
      }
      if (s == null) s = 19 * 60;
      e = s + need;
      r.notes.push(`No time given, so it goes in the first free gap, ${hhmm(s)}–${hhmm(e)}.`);
    }
    if (cmd.len && cmd.start != null && cmd.end != null && Math.abs(cmd.end - cmd.start - cmd.len) > 20) r.notes.push(`You said ${dur(cmd.len)} but ${hhmm(cmd.start)}–${hhmm(cmd.end)} is ${dur(cmd.end - cmd.start)}; I've used the times.`);
    s = r5(s); e = r5(e);
    if (e <= s) { r.err = "The end time is before the start time."; return r; }
    r.start = s; r.end = e;

    if (cmd.pid) {
      // already planned?
      for (let k = 0; k < plan.days.length; k++) {
        const hit = timelineFor(plan.days[k], k).find((x) => x.pid === cmd.pid);
        if (!hit) continue;
        if (k === i) { r.err = `${hit.title} is already on day ${i + 1} (${hhmm(hit.start)}–${hhmm(hit.end)}). To move it, change its times with “Edit this day”, or remove it first.`; return r; }
        r.warns.push(`${hit.title} is also on day ${k + 1}. Type “remove ${hit.title.split(/[:(&]/)[0].trim()} on day ${k + 1}” afterwards if you only want it once.`);
        break;
      }
    }
    const clash = items.filter((x) => FIXED(x) && x.start < e && x.end > s);
    if (clash.length) { r.err = `That clashes with ${clash.map((x) => "“" + x.title + "” (" + hhmm(x.start) + "–" + hhmm(x.end) + ")").join(" and ")}, which can't move. Pick another time or day.`; return r; }

    if (cmd.action === "outing") {
      const B = CITIES[cmd.city];
      const asked = cmd.mode;
      const ch = chooseLeg(A, B, hotel, asked);
      if (!ch) { r.err = `There's no practical way to get from ${A.name} to ${B.name} and back for a few hours.`; return r; }
      if (asked && ch.L.mode !== asked) r.warns.push(`${MODE[asked].label} doesn't run between ${A.name} and ${B.name}; using ${MODE[ch.L.mode].label.toLowerCase()} instead.`);
      const L = ch.L, other = ch.other;
      const total = e - s;
      if (L.out + L.back > 0.8 * total + 30 && L.out + L.back >= 5 * 60) { r.err = `${B.name} is about ${dur(L.out)} each way from ${A.name}${L.mode === "flight" ? " including airport time" : ""} — too far for a ${dur(total)} outing. Add ${B.name} as its own stop in step 2 instead.`; return r; }
      let backMode = L, backStart = Math.floor((e - L.back) / 5) * 5, arrive = Math.ceil((s + L.out) / 5) * 5;
      // the last train back
      if (L.mode === "train" && L.lastBack != null) {
        const trainBack = backStart + L.tr.to.mins + 15;
        if (trainBack > L.lastBack) {
          const carL = outingLeg("car", A, B, hotel);
          const lateLeave = L.lastBack - L.tr.to.mins - 15;
          r.warns.push(`The last train back from ${L.tr.to.n} leaves around ${hhmm(L.lastBack)} (check the operator's app). To finish at ${hhmm(e)} you'd need to leave town by ${hhmm(backStart)}, which misses it${carL ? " — so the way back is by private car" : ""}. Or leave Furong by ${hhmm(lateLeave)} to catch it.`.replace("Furong", B.name));
          if (carL) { backMode = carL; backStart = Math.floor((e - carL.back) / 5) * 5; }
        }
      }
      if (L.mode === "train" && L.lastOut != null && s + L.acc + L.tr.wait > L.lastOut) { r.err = `The last trains to ${L.tr.to.n} leave around ${hhmm(L.lastOut)}; start earlier or go by car.`; return r; }
      let there = backStart - arrive;
      // not enough time there: offer to start earlier or finish later
      const want = Math.max(150, cmd.pid ? Math.round(hoursOf(findPlace(B, cmd.pid).h) * 60) : 150);
      if (there < want) {
        const earlier = r5(s - (want - there));
        if (earlier >= 7 * 60 && !items.some((x) => FIXED(x) && x.start < s && x.end > earlier)) r.alts.push({ label: `Start at ${hhmm(earlier)} instead (${dur(want)} in ${B.name})`, start: earlier, end: e });
        if (L.mode === "train" && L.lastBack != null) {
          // finish so that leaving town still catches the last train
          const lateEnd = Math.floor((L.lastBack - L.tr.to.mins - 15 + L.back) / 5) * 5;
          if (lateEnd > e && lateEnd - L.back - arrive > there + 20) r.alts.push({ label: `Catch the last train back (~${hhmm(L.lastBack)}), at the hotel ~${hhmm(lateEnd)} — ${dur(lateEnd - L.back - arrive)} in ${B.name}`, start: s, end: lateEnd });
        } else if (e + (want - there) <= 24 * 60 - 30) r.alts.push({ label: `Finish at ${hhmm(r5(e + (want - there)))} instead`, start: s, end: r5(e + (want - there)) });
      }
      if (there < 45) { r.err = `Getting to ${B.name} and back takes about ${dur(L.out + backMode.back)} from ${stayName(A)}, leaving only ${Math.max(0, there)} min there. Try a longer window.`; return r; }
      if (there < want) r.warns.push(`That leaves about ${dur(there)} in ${B.name}. ${r.alts.length ? "Options below give you more time." : ""}`);
      r.leg = L; r.other = other; r.backMode = backMode;
      r.items.push(make({ k: "travel", icon: MODE[L.mode].icon, title: `${MODE[L.mode].label} to ${B.name}`, start: s, end: arrive, note: String(L.outText).replace(/<[^>]+>/g, "") + " " + L.cost + ".", ll: B.stay.ll }));
      // what to do there: the place asked for (or the top sights), a halal meal if there is one, the view after dark
      const picks = cmd.pid ? [findPlace(B, cmd.pid)] : B.places.filter((p) => p.r === 3).concat(B.places.filter((p) => p.r !== 3)).slice(0, 3);
      const mealAt = arrive <= 19 * 60 + 30 && backStart >= 18 * 60 + 30 ? "dinner" : arrive <= 13 * 60 && backStart >= 12 * 60 + 30 ? "lunch" : null;
      const winter = day.date && (day.date.getMonth() > 8 || day.date.getMonth() < 3);
      const dark = !!(B.night && B.night.length) && backStart >= (winter ? 18 * 60 : 19 * 60 + 15);
      const halalB = (B.halal || []).find((h) => h.ll), halalA = (A.halal || [])[0];
      let nightLen = dark ? Math.min(60, Math.max(30, Math.round(there * 0.35))) : 0;
      let mealLen = mealAt && halalB ? 60 : 0;
      let sightAvail = there - nightLen - mealLen;
      if (sightAvail < 40 && mealLen) { mealLen = 0; sightAvail = there - nightLen; }
      if (sightAvail < 30 && dark) { nightLen = there; sightAvail = 0; }
      let t = arrive;
      picks.forEach((p, k) => {
        const left = sightAvail - (t - arrive);
        if (left < (k ? 45 : 25)) return;
        const st = r5(t + (k ? 10 : 0));
        const en = r5(st + Math.min(Math.round(hoursOf(p.h) * 60), left - (k ? 10 : 0)));
        if (en - st < 25) return;
        r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: st, end: en, note: [p.c, tipFor(p, st)].filter(Boolean).join(" · ") }));
        t = en;
      });
      if (mealLen) {
        const ms = Math.ceil(Math.max(t, mealAt === "dinner" ? 17 * 60 + 30 : 11 * 60 + 45) / 5) * 5, me = Math.min(ms + 60, backStart - nightLen);
        if (me - ms >= 30) { r.items.push(make({ k: "meal", title: `${mealAt === "dinner" ? "Dinner" : "Lunch"} — ${halalB.n}`, start: ms, end: me, ll: halalB.ll, note: halalB.note })); t = me; }
      }
      const dusk = winter ? 17 * 60 + 45 : 19 * 60 + 15;
      if (nightLen && backStart - t >= 25) {
        const ns = Math.max(r5(t), Math.min(dusk, backStart - 30));
        if (ns - t >= 30) r.items.push(make({ k: "free", title: `Free time in ${B.name}`, start: r5(t), end: ns, note: "Wander the lanes, a snack or souvenirs while it gets dark." }));
        r.items.push(make({ k: "sight", title: "After dark: " + String(B.night[0]).replace(/\.$/, ""), start: ns, end: backStart, ll: B.stay.ll, note: "" })); t = backStart;
      }
      else if (backStart - t >= 30) r.items.push(make({ k: "free", title: `Free time in ${B.name}`, start: r5(t), end: backStart, note: "Wander the lanes, a snack or souvenirs." }));
      // no halal food at the destination: eat before you go if the day has room, and say what to do there
      if (mealAt && !halalB) {
        const ms = r5(s - 70), me = s - 10;
        const soft = (x) => ["free", "rest", "shop", "cafe"].indexOf(x.k) >= 0;
        const near = items.filter((x) => x.end > ms && x.start < me);
        const busy = near.some((x) => !soft(x));
        const eatA = (A.halal || []).find((h) => h.ll) || halalA;
        if (!busy && eatA && ms >= (mealAt === "dinner" ? 15 * 60 + 30 : 11 * 60)) {
          near.forEach((x) => { if (x.start < ms && ms - x.start >= 20) r.trimmed.push({ x, end: ms }); else r.removed.push(x); });
          r.items.unshift(make({ k: "meal", title: `Early ${mealAt} (halal) — ${eatA.n}`, start: ms, end: me, ll: eatA.ll || null, note: `${B.name} has no halal restaurants we know of, so eat before you leave. ${eatA.note || ""}`.trim() }));
        }
        if (!r.items.some((x) => x.k === "meal")) r.notes.push(`There's no gap for a halal ${mealAt} before you leave, so eat a late lunch, carry food, or have a late halal meal back in ${A.name} (Turkish grills and kebab shops often stay open late — check Google Maps).`);
        r.notes.push(`Halal food in ${B.name}: ${B.halalTip || "very limited."} Carry snacks; if you eat there, show the halal card (Phrases tab) and choose fish or vegetarian dishes.`);
      }
      r.there = there;
      r.items.push(make({ k: "travel", icon: MODE[backMode.mode].icon, title: `${MODE[backMode.mode].label} back to ${stayName(A)}`, start: backStart, end: e, ll: hotel.ll,
        note: backMode.mode === "train" && backMode.tr ? `~${backMode.tr.to.mins} min to ${backMode.tr.to.n}, train ~${backMode.ride} min, then ~${backMode.acc} min to your hotel.` : backMode.mode === "train" ? `Train ~${dur(backMode.ride)} on board, plus getting to the station and back to your hotel. Check the last train back on the operator's app.` : backMode.note || "" }));
      if (L.note) r.notes.push(L.note);
      if (other) r.notes.push(`Alternative: ${MODE[other.mode].label.toLowerCase()}, about ${dur(other.out)} there and ${dur(other.back)} back (${other.cost}). ${L.out + L.back <= other.out + other.back ? MODE[L.mode].label + " is quicker door to door." : asked === L.mode ? "You asked for the " + MODE[L.mode].label.toLowerCase() + "." : MODE[L.mode].label + " is a little slower door to door but much cheaper, and doesn't depend on finding a driver for the return."}`);
      r.summary = `${B.name} outing ${hhmm(s)}–${hhmm(e)} (${dur(there)} there) on day ${i + 1} by ${MODE[L.mode].label.toLowerCase()}${backMode !== L ? " (back by car)" : ""}`;
    } else if (cmd.action === "place") {
      const p = findPlace(A, cmd.pid), g = getThere(hotel, p, A);
      if (p.x && km(hotel.ll, p.ll) > 12) {
        const go = g.mins || 60;
        if (e - s < go * 2 + 60) r.warns.push(`${p.n} is about ${dur(go)} each way from ${stayName(A)} — ${dur(e - s)} leaves little time there.`);
        r.items.push(make({ k: "travel", icon: "🚐", title: "Travel to " + p.n.split(/[:(]/)[0].trim(), start: s, end: s + go, note: firstSentence(p.x) }));
        r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: s + go, end: Math.max(s + go + 30, e - go), note: p.c }));
        r.items.push(make({ k: "travel", icon: "🚐", title: "Back to " + A.name, start: Math.max(s + go + 30, e - go), end: e, ll: hotel.ll }));
      } else r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: s, end: e, note: [p.c, tipFor(p, s)].filter(Boolean).join(" · ") }));
      const eat = (A.halal || []).filter((h) => h.ll).map((h) => ({ h, d: km(p.ll, h.ll) })).sort((a, b) => a.d - b.d)[0];
      if (eat) r.notes.push(`Nearest halal food: ${eat.h.n} (~${eat.d.toFixed(1)} km).`);
      if (day.date && p.cl && p.cl.indexOf(day.date.getDay()) >= 0) r.warns.push(`${p.n} is usually closed on ${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][day.date.getDay()]} — pick another day.`);
      if ((p.s || []).indexOf("n") < 0 && (p.s || []).length && s >= 18 * 60) r.warns.push(`${p.n} is a daytime visit — it may be closed by ${hhmm(s)}.`);
      r.summary = `${p.n.split(/[:(]/)[0].trim()} ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else if (cmd.action === "meal") {
      const h = cmd.halal != null ? A.halal[cmd.halal] : null;
      const word = cmd.meal === "breakfast" ? "Breakfast" : cmd.meal === "lunch" ? "Lunch" : "Dinner";
      r.items.push(make({ k: "meal", title: h ? word + " — " + h.n : word + " (halal)", start: s, end: e, ll: h ? h.ll : null, note: h ? h.note : A.halalTip }));
      if (!h) r.notes.push(`Halal options in ${A.name}: ${A.halal.slice(0, 3).map((x) => x.n).join(" · ")}.`);
      r.summary = `${word} ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else if (cmd.action === "free") {
      r.items.push(make({ k: "free", title: "Free time", start: s, end: e, note: "Kept free at your request." }));
      r.summary = `Free time ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else {
      const title = cmd.title ? cmd.title.charAt(0).toUpperCase() + cmd.title.slice(1) : "My plan";
      r.items.push(make({ k: "custom", title, start: s, end: e, note: "" }));
      r.summary = `“${title}” ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    }
    // what makes way: items inside the window go, ones that run into it are shortened
    {
      items.forEach((x) => {
        if (cmd.action === "meal" && x.k === (cmd.meal === "breakfast" ? "breakfast" : "meal") && Math.abs(x.start - s) <= 150) { r.removed.push(x); return; }
        if (FIXED(x) || x.end <= s || x.start >= e) return;
        if (x.start < s && s - x.start >= 20) r.trimmed.push({ x, end: s });
        else r.removed.push(x);
      });
    }
    // a trip out of town that goes also takes its travel there and back with it
    const goneTrips = r.removed.filter((x) => x.k === "sight" && x.pid);
    const legOf = (x) => x.k === "travel" && !FIXED(x) && goneTrips.some((g) => { const short = g.title.replace(/^Day trip to /, "").split(/[:(]/)[0].trim(); return x.title.indexOf(short) >= 0 || (/^Back to /.test(x.title) && x.start >= g.end - 5 && x.start - g.end <= 20); });
    r.trimmed = r.trimmed.filter((tr) => { if (legOf(tr.x)) { r.removed.push(tr.x); return false; } return true; });
    items.forEach((x) => { if (legOf(x) && r.removed.indexOf(x) < 0) r.removed.push(x); });
    const seen = {};
    r.removed = r.removed.filter((x) => !seen[x.id] && (seen[x.id] = 1));
    r.trimmed = r.trimmed.filter((tr) => !seen[tr.x.id] && (seen[tr.x.id] = 1));
    r.ok = true;
    return r;
  }

  // The day's items with a worked-out change put in
  function mergeResult(items, r, tag, extra) {
    const gone = new Set(r.removed.map((x) => x.id));
    const out = items.filter((x) => !gone.has(x.id));
    r.trimmed.forEach((tr) => { const x = out.find((y) => y.id === tr.x.id); if (x) x.end = tr.end; });
    r.items.forEach((x, k) => out.push(Object.assign({}, x, { id: tag + k }, extra || {})));
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  // Apply a worked-out change to the day and remember how to undo it
  function applyAsk(r) {
    const day = lastPlan.days[r.i], key = dayKey(day, r.i);
    const before = state.edits && state.edits[key] ? JSON.parse(JSON.stringify(state.edits[key])) : null;
    const stamp = Date.now().toString(36);
    saveTimeline(r.i, mergeResult(timelineFor(day, r.i), r, "q" + stamp));
    state.asks = (state.asks || []).concat([{ id: stamp, key, day: r.i, text: r.cmd.raw, summary: r.summary, before }]).slice(-20);
    persist();
    refreshDay(r.i);
    const el = document.getElementById("day-" + (r.i + 1));
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800); }
  }
  function undoAsk(id) {
    const list = state.asks || [], a = list.find((x) => x.id === id);
    if (!a) return;
    const later = list.filter((x) => x.key === a.key && x.id > a.id);
    if (later.length) { toast("Undo the later change to that day first."); return; }
    state.edits = state.edits || {};
    if (a.before) state.edits[a.key] = a.before; else delete state.edits[a.key];
    state.asks = list.filter((x) => x.id !== id);
    persist();
    if (lastPlan && lastPlan.days[a.day] && dayKey(lastPlan.days[a.day], a.day) === a.key) refreshDay(a.day);
    renderAskHistory();
    toast("Undone.");
  }

  /* ---------- the box ---------- */
  let askDraft = "", askTimer = null, askResult = null, askSample = null, askBusy = null;
  try { askDraft = load("askDraft") || ""; } catch (e) { askDraft = ""; }
  if (window.claude && typeof window.claude.use === "function") {
    try { window.claude.use("sample").then((s) => { askSample = s || null; if (askSample) renderAskPreview(); }, () => {}); } catch (e) { /* not available */ }
  }
  function askExamples(plan) {
    const ex = [];
    const d0 = plan.days.findIndex((d) => d.kind === "full");
    const label = (i) => (plan.days[i].date ? "on " + plan.days[i].date.getDate() + " " + MONTHS[plan.days[i].date.getMonth()] : "on day " + (i + 1));
    // a day trip to the nearest town that isn't already a stop
    plan.stops.some((st) => {
      const di = plan.days.findIndex((d) => d.cityId === st.id && d.kind === "full");
      const town = di >= 0 ? tripOptions(st.id).towns.find((x) => !plan.stops.some((s) => s.id === x.id)) : null;
      if (town) ex.push(`Add a trip from ${CITIES[st.id].name.replace(/ \(.*\)/, "")} to ${CITIES[town.id].name.replace(/ \(.*\)/, "")} ${label(di)} from 9am till 6pm`);
      return !!town;
    });
    if (d0 >= 0) {
      const c = plan.days[d0].city, used = new Set(timelineFor(plan.days[d0], d0).map((x) => x.pid));
      const p = c.places.find((x) => !used.has(x.id) && !x.x);
      if (p) ex.push(`Add ${p.n.split(/[:(]/)[0].trim()} ${label(d0)} afternoon`);
      ex.push(`Keep the evening ${label(d0).replace(/^on /, "of ")} free`);
      const h = c.halal.find((x) => x.ll);
      if (h) ex.push(`Dinner at ${h.n.split(/[:(]/)[0].trim()} ${label(d0)} at 7pm`);
    }
    return ex.slice(0, 4);
  }
  function askHTML(plan) {
    return `<section class="ask panel" id="askBox" aria-labelledby="askH">
      <h3 id="askH">✍️ Change my plan</h3>
      <p class="hint">Type what you'd like, in your own words. You'll see how it fits — transport, timings, halal food and what it replaces — before you add it.</p>
      <div class="ask-row"><textarea id="askIn" rows="2" placeholder="e.g. Add a trip from Florence to Venice on day 6 from 8am to 7pm · Dinner at 7pm on day 2 · Keep the evening of day 3 free" aria-label="Your change">${esc(askDraft)}</textarea>
      <button type="button" class="btn print-btn" id="askGo">Work it out</button></div>
      <div class="ask-ex">${askExamples(plan).map((x) => `<button type="button" class="btn small" data-askex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div id="askOut" aria-live="polite"></div>
      <div id="askHist"></div>
    </section>`;
  }
  function askPreviewHTML(r) {
    if (!r) return "";
    if (!r.ok) {
      if (r.err === "nothing") return `<p class="ask-msg">I couldn't tell what to add yet. Name a place or city, a day (“28 Dec” or “day 7”) and a time (“5pm to 10pm”, “afternoon”).${askSample ? ` <button type="button" class="btn small" id="askClaude">Ask Claude to read it</button>` : ""}</p>`;
      return `<p class="ask-msg warn">${esc(r.err)}${askSample && r.cmd && (r.cmd.day == null || r.cmd.day < 0) ? "" : ""}</p>` + (askSample && /Which day|couldn't find/.test(r.err) ? `<p><button type="button" class="btn small" id="askClaude">Ask Claude to read it</button></p>` : "");
    }
    const rows = r.items.map((x) => `<li class="tl-item k-${x.k}"><span class="tl-time">${hhmm(x.start)}–${hhmm(x.end)}</span><span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span><span class="tl-body"><b>${esc(x.title)}</b>${x.note ? `<span class="tl-note">${esc(x.note)}</span>` : ""}</span></li>`).join("");
    const gone = r.removed.map((x) => `${esc(x.title)} (${hhmm(x.start)})`).concat(r.trimmed.map((tr) => `${esc(tr.x.title)} shortened to end ${hhmm(tr.end)}`));
    return `<div class="ask-card">
      <div class="ask-where"><b>${esc(r.where)}</b> · ${hhmm(r.start)}–${hhmm(r.end)}${r.cmd.action === "remove" ? "" : ` · ${esc(r.summary.split(" on day")[0])}`}</div>
      ${r.warns.map((w) => `<p class="ask-msg warn">⚠️ ${esc(w)}</p>`).join("")}
      ${rows ? `<ol class="tl-list">${rows}</ol>` : ""}
      ${gone.length ? `<p class="hint"><b>${r.cmd.action === "remove" ? "Removes" : "Makes way by removing"}:</b> ${gone.join(" · ")}</p>` : ""}
      ${r.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join("")}
      <div class="actions"><button type="button" class="btn primary ask-add" id="askAdd">✓ ${r.cmd.action === "remove" ? "Remove it" : "Add to day " + (r.i + 1)}</button>${r.alts.map((a, k) => `<button type="button" class="btn small" data-askalt="${k}">${esc(a.label)}</button>`).join("")}</div>
    </div>`;
  }
  function renderAskPreview() {
    const box = $("#askOut");
    if (!box) return;
    const txt = ($("#askIn") || {}).value || "";
    if (!txt.trim()) { box.innerHTML = ""; askResult = null; return; }
    if (!askResult || askResult.cmd.raw !== txt.trim()) askResult = workOut(parseAsk(txt, lastPlan), lastPlan);
    box.innerHTML = askPreviewHTML(askResult);
    audifyIn(box);
  }
  function renderAskHistory() {
    const h = $("#askHist");
    if (!h) return;
    const list = (state.asks || []).slice().reverse();
    h.innerHTML = list.length ? `<h4>Your changes</h4><ul class="ask-hist">${list.map((a) => `<li><span>${esc(a.summary)}</span> <button type="button" class="btn small" data-askundo="${a.id}">↺ Undo</button></li>`).join("")}</ul>` : "";
  }
  // Ask Claude (claude.ai page only) to turn the text into the same command
  function askClaude() {
    const txt = ($("#askIn") || {}).value || "";
    if (!askSample || !txt.trim() || askBusy) return;
    const box = $("#askOut");
    box.innerHTML = `<p class="ask-msg">Asking Claude… <button type="button" class="btn small" id="askStop">Stop</button></p>`;
    const ctl = new AbortController(); askBusy = ctl;
    const plan = lastPlan;
    const days = plan.days.map((d, i) => `${i + 1}: ${d.date ? isoDate(d.date) + " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.date.getDay()] : "no date"}, staying in ${d.city.name} (${d.cityId})`).join("\n");
    const cityIds = Object.keys(CITIES).map((id) => `${id}=${CITIES[id].name}`).join(", ");
    const near = plan.stops.map((s) => s.id).concat(...plan.stops.map((s) => tripOptions(s.id).towns.slice(0, 4).map((x) => x.id)));
    const places = near.filter((v, k, a) => a.indexOf(v) === k).map((cid) => `${CITIES[cid].name}: ` + CITIES[cid].places.map((p) => `${p.id}=${p.n.split(/[:(]/)[0].trim()}`).join("; ")).join("\n");
    const prompt = `A traveller is editing a Europe trip itinerary. Turn their request into ONE JSON command for the page to plan.
Trip days (day number: date, where they sleep):
${days}
City ids: ${cityIds}
Known places (id=name):
${places}

Reply with only a JSON object:
{"action": "outing"|"place"|"meal"|"free"|"custom"|"remove"|"none", "day": <trip day number>, "start": "HH:MM" or null, "end": "HH:MM" or null, "city": <city id for a trip to another city, else null>, "place": <place id or null>, "mode": "train"|"car"|"bus"|"boat"|"flight"|null, "meal": "breakfast"|"lunch"|"dinner"|null, "title": <short title for custom items, or the item to remove>, "question": <if you can't tell, one short question for the traveller, else null>}
Use "outing" for a few hours in a different city from where they sleep that day. Use 24-hour times; "5pm onwards till 10pm" is 17:00–22:00.

Request: ${txt.trim()}`;
    askSample.json(prompt, { modelTier: "quick", signal: ctl.signal }).then((j) => {
      askBusy = null;
      if (!j || typeof j !== "object" || j.action === "none" || !j.action) { box.innerHTML = `<p class="ask-msg">${esc((j && j.question) || "Claude couldn't tell what to change. Try naming the place, day and time.")}</p>`; return; }
      const cmd = { raw: txt.trim(), action: String(j.action), day: j.day != null ? +j.day - 1 : null, start: toMin(j.start), end: toMin(j.end), len: null, part: null, city: j.city && CITIES[j.city] ? j.city : null, from: null,
        pid: null, halal: null, mode: MODE[j.mode] ? j.mode : null, title: j.title ? String(j.title) : null, meal: MEAL_WIN[j.meal] ? j.meal : null, said: {} };
      if (j.place) Object.keys(CITIES).forEach((cid) => { const p = CITIES[cid].places.find((x) => x.id === j.place); if (p) { cmd.pid = p.id; cmd.city = cid; } });
      if (cmd.day != null && (cmd.day < 0 || cmd.day >= plan.days.length)) cmd.day = -1;
      if (cmd.action === "outing" && cmd.city && cmd.day >= 0 && plan.days[cmd.day].cityId === cmd.city) cmd.action = cmd.pid ? "place" : "custom";
      if (cmd.action === "place" && cmd.pid && cmd.day >= 0 && plan.days[cmd.day].cityId !== cmd.city) cmd.action = "outing";
      if (["outing", "place", "meal", "free", "custom", "remove"].indexOf(cmd.action) < 0) cmd.action = null;
      askResult = workOut(cmd, plan);
      box.innerHTML = `<p class="hint">Read by Claude.</p>` + askPreviewHTML(askResult);
      audifyIn(box);
    }, (err) => {
      askBusy = null;
      const code = err && err.code;
      if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled" || code === "capability_removed") { askSample = null; box.innerHTML = `<p class="ask-msg">Claude isn't available here — try naming the place, day and time.</p>`; return; }
      if (code === "cancelled") { renderAskPreview(); return; }
      box.innerHTML = `<p class="ask-msg warn">${code === "rate_limited" ? "Too many requests just now — try again in a minute." : "Claude couldn't answer just now."} <button type="button" class="btn small" id="askClaude">Try again</button></p>`;
    });
  }
  function bindAsk() {
    const out = $("#out");
    out.addEventListener("input", (e) => {
      if (e.target.id !== "askIn") return;
      askDraft = e.target.value; save("askDraft", askDraft);
      clearTimeout(askTimer);
      askTimer = setTimeout(renderAskPreview, 250);
    });
    out.addEventListener("keydown", (e) => {
      if (e.target.id === "askIn" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); clearTimeout(askTimer); askResult = null; renderAskPreview(); }
    });
    out.addEventListener("click", (e) => {
      const b = e.target.closest("#askGo, #askAdd, #askClaude, #askStop, [data-askex], [data-askalt], [data-askundo]");
      if (!b) return;
      if (b.id === "askGo") { clearTimeout(askTimer); askResult = null; renderAskPreview(); return; }
      if (b.id === "askClaude") { askClaude(); return; }
      if (b.id === "askStop") { if (askBusy) askBusy.abort(); return; }
      if (b.dataset.askex != null) { const t = $("#askIn"); t.value = b.dataset.askex; askDraft = t.value; save("askDraft", askDraft); askResult = null; renderAskPreview(); t.focus(); return; }
      if (b.dataset.askundo != null) { undoAsk(b.dataset.askundo); return; }
      if (b.dataset.askalt != null && askResult) {
        const a = askResult.alts[+b.dataset.askalt];
        const cmd = Object.assign({}, askResult.cmd, { start: a.start, end: a.end, part: null, len: null, said: Object.assign({}, askResult.cmd.said, { day: askResult.cmd.said.day === "auto" ? "picked" : askResult.cmd.said.day }) });
        askResult = workOut(cmd, lastPlan);
        $("#askOut").innerHTML = askPreviewHTML(askResult);
        audifyIn($("#askOut"));
        return;
      }
      if (b.id === "askAdd" && askResult && askResult.ok) {
        const r = askResult;
        applyAsk(r);
        const t = $("#askIn"); t.value = ""; askDraft = ""; save("askDraft", "");
        askResult = null;
        $("#askOut").innerHTML = `<p class="ask-msg good">✓ ${esc(r.summary)}. Undo it below any time.</p>`;
        renderAskHistory();
        toast("Added to day " + (r.i + 1) + " — the summary, printout and PDF include it.");
      }
    });
  }

  /* ---------- planned before building: day trips on each city card, and typed requests in the builder ---------- */
  const TRIP_LEN = [["full", "Full day"], ["half", "Half day (~3½ h there)"], ["120", "2 hours there"], ["180", "3 hours there"], ["240", "4 hours there"], ["300", "5 hours there"], ["360", "6 hours there"]];
  const TRIP_WHEN = [["best", "Best time"], ["m", "Morning"], ["e", "Afternoon"], ["n", "Evening (incl. after dark)"]];
  const thereMins = (len) => (len === "full" ? 450 : len === "half" ? 210 : +len || 180);
  // Day trips worth offering from a city: other towns within ~3½ h each way, and the city's own out-of-town sights
  function tripOptions(cid) {
    const A = CITIES[cid], hotel = hotelPoint(A), towns = [];
    Object.keys(CITIES).forEach((bid) => {
      if (bid === cid) return;
      const ch = chooseLeg(A, CITIES[bid], hotel, null);
      if (ch && ch.L.out <= 210 && ch.L.back <= 210) towns.push({ id: bid, L: ch.L });
    });
    towns.sort((a, b) => a.L.out - b.L.out);
    const sights = A.places.filter((p) => p.x || (p.s || []).indexOf("full") >= 0);
    return { towns, sights };
  }
  // Day numbers and dates for each night of each stop (in the current order)
  function stopDays(si) {
    let off = 0;
    for (let k = 0; k < si; k++) off += state.stops[k].nights;
    const start = state.start ? new Date(state.start + "T00:00:00") : null;
    const out = [];
    for (let k = 0; k < state.stops[si].nights; k++) out.push({ k, day: off + k + 1, date: start ? new Date(start.getTime() + (off + k) * 86400000) : null });
    return out;
  }
  function tripLabel(t, cid) {
    const A = CITIES[cid];
    const name = t.to.indexOf("place:") === 0 ? (A.places.find((p) => p.id === t.to.slice(6)) || { n: "?" }).n.split(/[:(]/)[0].trim() : (CITIES[t.to] || { name: "?" }).name;
    const len = (TRIP_LEN.find((x) => x[0] === t.len) || [0, ""])[1].replace(" there", "");
    const when = t.len === "full" ? "" : t.when && t.when !== "best" ? " · " + (TRIP_WHEN.find((x) => x[0] === t.when) || [0, ""])[1].split(" (")[0].toLowerCase() : "";
    const on = t.k != null && t.k >= 0 ? (() => { const d = stopDays(state.stops.findIndex((s) => s.city === cid))[t.k]; return d ? " · day " + d.day + (d.date ? " (" + fmtDate(d.date) + ")" : "") : ""; })() : "";
    return `${name} · ${len}${when}${on}${t.mode && t.mode !== "best" ? " · " + MODE[t.mode].label.toLowerCase() : ""}`;
  }
  function tripRow(st, i) {
    const c = CITIES[st.city], o = tripOptions(st.city), trips = st.trips || [];
    const townOpts = o.towns.map((x) => `<option value="${x.id}">${esc(CITIES[x.id].name)} — ~${dur(x.L.out)} each way by ${MODE[x.L.mode].label.toLowerCase()}${state.stops.some((s) => s.city === x.id) ? " (also a stop)" : ""}</option>`).join("");
    const sightOpts = o.sights.map((p) => `<option value="place:${p.id}">${esc(p.n.split(/[:(]/)[0].trim())}</option>`).join("");
    const days = stopDays(i).map((d) => `<option value="${d.k}">Day ${d.day}${d.date ? " · " + esc(fmtDate(d.date)) : ""}${d.k === 0 ? (i === 0 ? " (arrival)" : " (travel day)") : ""}</option>`).join("");
    const chips = trips.map((t, k) => `<span class="chip trip">🚆 ${esc(tripLabel(t, st.city))}<button type="button" data-act="tripdel" data-i="${i}" data-k="${k}" aria-label="Remove this day trip">×</button></span>`).join("");
    const none = !townOpts && !sightOpts;
    return `<details class="trips"${trips.length ? " open" : ""}><summary>🚆 Day trips from ${esc(c.name.replace(/ \(.*\)/, ""))}${trips.length ? ` <span class="badge pick">${trips.length}</span>` : ""}</summary>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${none ? `<p class="hint">No other towns on our list are close enough to ${esc(c.name)} for a day trip.</p>` : `<div class="tripadd">
        <label class="hint" for="tripto-${i}">Go to</label>
        <select id="tripto-${i}">${townOpts ? `<optgroup label="Nearby cities & towns">${townOpts}</optgroup>` : ""}${sightOpts ? `<optgroup label="Out-of-town sights">${sightOpts}</optgroup>` : ""}</select>
        <label class="hint" for="triplen-${i}">How long</label>
        <select id="triplen-${i}">${TRIP_LEN.map(([v, l]) => `<option value="${v}" ${v === "240" ? "selected" : ""}>${l}</option>`).join("")}</select>
        <label class="hint" for="tripwhen-${i}">When</label>
        <select id="tripwhen-${i}">${TRIP_WHEN.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        <label class="hint" for="tripday-${i}">Which day</label>
        <select id="tripday-${i}"><option value="-1">Best day for it</option>${days}</select>
        <label class="hint" for="tripmode-${i}">By</label>
        <select id="tripmode-${i}"><option value="best">Best option</option><option value="train">Train</option><option value="car">Hire car</option><option value="bus">Coach / bus</option><option value="boat">Ferry</option></select>
        <button type="button" class="btn small" data-act="tripadd" data-i="${i}">＋ Add day trip</button>
      </div>`}
    </details>`;
  }
  function addTrip(i) {
    const st = state.stops[i];
    const t = { id: "t" + Date.now().toString(36), to: $("#tripto-" + i).value, len: $("#triplen-" + i).value, when: $("#tripwhen-" + i).value, k: +$("#tripday-" + i).value, mode: $("#tripmode-" + i).value };
    if (!t.to) return;
    if (t.k >= st.nights) t.k = -1;
    st.trips = (st.trips || []).concat([t]);
    persist(); renderStops(); renderReqPreview();
    if (lastPlan) generate(false);
    toast(`Day trip added: ${tripLabel(t, st.city)}. ${lastPlan ? "Your itinerary is updated." : "It goes in when you build the itinerary."}`);
  }

  // A trip on a city card → a command for workOut, on a chosen (or the best) day
  function tripCommand(t, si, plan, offset) {
    const A = CITIES[state.stops[si].city], st = state.stops[si];
    const dayIdx = (k) => offset + k;
    let k = t.k != null && t.k >= 0 && t.k < st.nights ? t.k : null;
    const isPlace = t.to.indexOf("place:") === 0;
    const there = thereMins(t.len);
    if (k == null) {
      // the best day: a full day in this city, fewest sights, no other trip already
      let best = null;
      for (let q = 0; q < st.nights; q++) {
        const d = plan.days[dayIdx(q)];
        if (!d || d.kind === "depart") continue;
        const items = d.base || buildTimeline(d);
        const score = (d.kind === "full" ? 0 : t.len === "full" ? 50 : 8) + items.filter((x) => x.k === "sight").length + (items.some((x) => x.pr) ? 30 : 0);
        if (!best || score < best.score) best = { q, score };
      }
      k = best ? best.q : 0;
    }
    const cmd = { raw: tripLabel(t, A.id), day: dayIdx(k), start: null, end: null, len: null, part: null, city: null, from: null, pid: null, halal: null, mode: t.mode && t.mode !== "best" ? t.mode : null, title: null, meal: null, said: t.k != null && t.k >= 0 ? {} : { day: "auto" } };
    if (isPlace) {
      const p = A.places.find((x) => x.id === t.to.slice(6));
      Object.assign(cmd, { action: "place", pid: p ? p.id : null, city: A.id });
      if (t.len === "full") cmd.part = "full day";
      else {
        const when = t.when === "best" ? ((p && p.s) || ["m"])[0] : t.when;
        cmd.start = when === "n" ? 17 * 60 : when === "e" ? 13 * 60 : 8 * 60 + 30;
        const go = p ? getThere(hotelPoint(A), p, A).mins || 0 : 0;
        cmd.end = cmd.start + there + 2 * go;
      }
      return cmd;
    }
    const B = CITIES[t.to], ch = chooseLeg(A, B, hotelPoint(A), cmd.mode);
    Object.assign(cmd, { action: "outing", city: t.to });
    if (!ch) return cmd;
    const L = ch.L;
    cmd.mode = L.mode;
    const when = t.len === "full" ? "m" : t.when !== "best" ? t.when : B.night && B.night.length && there <= 240 ? "n" : there >= 300 ? "m" : "e";
    const d = plan.days[cmd.day], winter = d && d.date && (d.date.getMonth() > 8 || d.date.getMonth() < 3);
    let s;
    if (when === "n") {
      // be there a little before dusk, so you see it in daylight and lit up
      const arriveBy = (winter ? 17 * 60 + 45 : 19 * 60 + 15) - Math.min(there - 60, 90);
      s = arriveBy - L.out;
    } else s = when === "e" ? 13 * 60 : t.len === "full" ? 8 * 60 : 8 * 60 + 30;
    if (L.mode === "train" && L.firstOut != null && s + L.acc + L.tr.wait < L.firstOut) s = L.firstOut - L.acc - L.tr.wait;
    let e = s + L.out + there + L.back;
    if (L.mode === "train" && L.lastBack != null) {
      const latest = L.lastBack - L.tr.to.mins - 15 + L.back;
      if (e > latest) { const shift = e - latest; s -= shift; e -= shift; }
    }
    cmd.start = Math.floor(s / 5) * 5; cmd.end = Math.ceil(e / 5) * 5;
    return cmd;
  }

  // Requests typed in the builder: one per line
  const reqLines = () => String(state.requests || "").split(/\n+/).map((x) => x.trim()).filter((x) => x.length > 2);
  const lineId = (txt) => { let h = 0; for (let k = 0; k < txt.length; k++) h = (h * 31 + txt.charCodeAt(k)) | 0; return "r" + (h >>> 0).toString(36); };

  // Work every planned trip and request into the plan's days; returns what happened to each
  function applyPlanned(plan) {
    plan.days.forEach((d) => { d.base = null; });
    const report = [];
    const put = (label, kind, cmd, pr) => {
      if (cmd.day == null || cmd.day < 0 || !plan.days[cmd.day]) { const r0 = workOut(cmd, plan); report.push({ label, kind, ok: false, msg: r0.err === "nothing" ? "I couldn't tell what to add — name a place or town, a day and a time." : r0.err }); return; }
      const d = plan.days[cmd.day];
      const items = d.base || buildTimeline(d);
      // a sight already put on another day by the planner moves to the day asked for; note the gap it leaves
      let gap = null;
      if (cmd.pid && cmd.said.day !== "auto") plan.days.forEach((o, k) => {
        if (k === cmd.day || o.cityId !== d.cityId) return;
        const its = o.base || buildTimeline(o), P = findPlace(CITIES[o.cityId], cmd.pid);
        const short = P ? P.n.split(/[:(]/)[0].trim() : "\u0000";
        const goes = (x) => (x.pid === cmd.pid && !x.pr) || (x.k === "travel" && !x.pr && (x.title.indexOf(short) >= 0 || (/^Back to /.test(x.title) && its.some((y) => y.pid === cmd.pid && !y.pr && Math.abs(y.end - x.start) <= 20))));
        const out = its.filter(goes);
        if (!out.length) return;
        o.base = its.filter((x) => !goes(x));
        gap = { k, start: Math.min.apply(null, out.map((x) => x.start)), end: Math.max.apply(null, out.map((x) => x.end)) };
      });
      let r = workOut(cmd, plan, items);
      if (!r.ok && cmd.pid && /already on day/.test(r.err || "")) { report.push({ label, kind, ok: true, day: cmd.day, msg: `Already planned on day ${cmd.day + 1}.` }); return; }
      if (!r.ok) { report.push({ label, kind, ok: false, msg: r.err === "nothing" ? "I couldn't tell what to add — name a place or town, a day and a time." : r.err }); return; }
      d.base = mergeResult(items, r, pr + "-", { pr });
      // sights it displaced go into the gap it left (a swap of days), if they fit
      const moved = [];
      if (gap) {
        const o = plan.days[gap.k], A = o.city;
        let t = gap.start;
        r.removed.filter((x) => x.k === "sight" && x.pid).forEach((x, n) => {
          const len = x.end - x.start, st = r5(t + (n ? 20 : 0));
          if (st + len > gap.end + 30) return;
          o.base.push(Object.assign({}, x, { id: pr + "-m" + n, start: st, end: st + len, pr, note: `Moved from day ${cmd.day + 1} to make room.` }));
          moved.push(x.title.split(/[:(&]/)[0].trim()); t = st + len;
        });
        o.base.sort((a, b) => a.start - b.start || a.end - b.end);
        if (moved.length) r.removed = r.removed.filter((x) => moved.indexOf(x.title.split(/[:(&]/)[0].trim()) < 0);
      }
      const ed = state.edits && state.edits[dayKey(d, cmd.day)];
      const blocked = ed && !ed.some((x) => x.pr === pr);
      report.push({ label, kind, ok: !blocked, day: cmd.day, summary: r.summary, warns: r.warns, gone: r.removed.filter((x) => x.k === "sight").map((x) => x.title),
        moved: moved.length ? `Moved to day ${gap.k + 1}: ${moved.join(", ")}.` : "",
        msg: blocked ? `Day ${cmd.day + 1} has your own edits, so this isn't shown there. Use “Reset day” on day ${cmd.day + 1} to add it.` : "" });
    };
    let off = 0;
    state.stops.forEach((st, si) => {
      (st.trips || []).forEach((t) => put(tripLabel(t, st.city), "trip", tripCommand(t, si, plan, off), t.id));
      off += st.nights;
    });
    reqLines().forEach((line) => put(line, "req", parseAsk(line, plan), lineId(line)));
    plan.report = report;
    return report;
  }
  function reportHTML(report, built) {
    if (!report.length) return "";
    return `<ul class="req-list">${report.map((x) => `<li class="${x.ok ? "ok" : "bad"}"><b>${x.kind === "trip" ? "🚆" : "✍️"} ${esc(x.label)}</b><br>${x.ok ? "✓ " + esc(x.summary || x.msg) : "⚠️ " + esc(x.msg)}${(x.warns || []).map((w) => `<br><span class="hint">⚠️ ${esc(w)}</span>`).join("")}${x.moved ? `<br><span class="hint">${esc(x.moved)}</span>` : ""}${x.gone && x.gone.length ? `<br><span class="hint">Makes way by moving out: ${esc(x.gone.join(", "))}.</span>` : ""}${x.ok && x.msg && x.summary ? `<br><span class="hint">${esc(x.msg)}</span>` : ""}</li>`).join("")}</ul>`;
  }
  // Live preview in the builder of what the trips and requests will do
  let reqTimer = null;
  function renderReqPreview() {
    const box = $("#reqOut");
    if (!box) return;
    const has = reqLines().length || state.stops.some((s) => (s.trips || []).length);
    if (!has || !state.stops.length) { box.innerHTML = ""; return; }
    let rep;
    try { rep = applyPlanned(buildPlan(state)); } catch (e) { box.innerHTML = ""; return; }
    box.innerHTML = `<p class="hint"><b>What these will add</b>${lastPlan ? "" : " when you build the itinerary"}:</p>` + reportHTML(rep, false);
    audifyIn(box);
  }

  /* ---------- weather: typical (climate averages) for each date, or a live forecast within ~2 weeks ---------- */
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const isoDate = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  // Monthly averages sit mid-month; days in between are blended with the neighbouring month
  function typicalFor(cid, date) {
    const c = CLIMATE[cid];
    if (!c || !date) return null;
    const m = date.getMonth(), dim = new Date(date.getFullYear(), m + 1, 0).getDate();
    const pos = (date.getDate() - 15) / dim, f = Math.abs(pos), m2 = pos >= 0 ? (m + 1) % 12 : (m + 11) % 12;
    const mix = (a) => a[m] * (1 - f) + a[m2] * f;
    return { hi: mix(c.hi), lo: mix(c.lo), rain: mix(c.rain) / 30, mtn: c.mtn || "" };
  }
  const forecastCache = {};
  const wxIcon = (code) => (code === 0 ? "☀️" : code <= 2 ? "🌤" : code === 3 ? "☁️" : code === 45 || code === 48 ? "🌫" : code >= 71 && code <= 77 ? "❄️" : code >= 95 ? "⛈" : code >= 80 ? "🌦" : code >= 51 ? "🌧" : "🌤");
  const climIcon = (t) => (t.lo <= -3 ? "🥶" : t.rain >= 0.45 ? "🌦" : t.hi >= 30 ? "☀️" : t.hi <= 8 ? "🧥" : "🌤");
  function weatherFor(cid, date) {
    if (!date) return null;
    const f = forecastCache[cid + "|" + isoDate(date)];
    const mtn = (CLIMATE[cid] && CLIMATE[cid].mtn) || "";
    if (f) return { src: "forecast", hi: f.hi, lo: f.lo, rain: f.pp / 100, icon: wxIcon(f.code), mtn };
    const t = typicalFor(cid, date);
    return t ? Object.assign({ src: "typical", icon: climIcon(t) }, t) : null;
  }
  const deg = (v) => Math.round(v) + "°C";
  const rainWords = (p) => (p >= 0.6 ? "rain likely" : p >= 0.35 ? "showers possible" : p >= 0.15 ? "small chance of rain" : "rain unlikely");
  // What to wear for a day's high, low and chance of rain
  function attire(hi, lo, rain) {
    const out = [];
    if (hi >= 30) out.push("light, loose, breathable clothes (thin long sleeves keep you covered and cool)", "sun hat, sunglasses and SPF 50");
    else if (hi >= 24) out.push("light clothes", "a thin layer for evenings and air-conditioning");
    else if (hi >= 17) out.push("long sleeves", "a light jacket or cardigan");
    else if (hi >= 10) out.push("a sweater or fleece", "a medium jacket");
    else if (hi >= 4) out.push("a warm coat", "layers with a thermal top", "a scarf");
    else out.push("a down jacket", "thermal underwear", "hat, gloves and scarf", "warm, grippy boots for icy pavements");
    if (lo <= 0 && hi >= 4) out.push("gloves and a hat for mornings and evenings");
    if (rain >= 0.4) out.push("a compact umbrella or rain jacket", "water-resistant shoes");
    else if (rain >= 0.2) out.push("a compact umbrella");
    return out;
  }
  const attireShort = (hi, lo, rain) => {
    const b = hi >= 30 ? "Light & breathable, sun hat" : hi >= 24 ? "Light clothes + thin layer" : hi >= 17 ? "Long sleeves + light jacket" : hi >= 10 ? "Sweater + jacket" : hi >= 4 ? "Warm coat, layers, scarf" : "Down jacket, thermals, hat & gloves";
    return b + (rain >= 0.4 ? " · rain gear" : rain >= 0.2 ? " · umbrella" : "");
  };
  // Extra items for what's planned that day
  const HIGH_PLACES = /jungfrau|titlis|pilatus|schilthorn|grindelwald first|harder kulm|rigi|zugspitze|uetliberg|trebević|holmenkollen|fløyen|dajti/i;
  function dayExtras(day) {
    const ps = day.slots.filter((s) => s.type === "act").map((s) => s.p), out = [];
    if (ps.some((p) => p.t.indexOf("adventure") >= 0 || p.t.indexOf("nature") >= 0 || p.s.indexOf("full") >= 0)) out.push("comfortable, grippy walking shoes (cobblestones and hills)");
    if (ps.some((p) => HIGH_PLACES.test(p.n))) out.push("a warm jacket, gloves and sunglasses for the mountain top");
    if (ps.some((p) => /mosque|hagia sophia|mezquita/i.test(p.n))) out.push("modest clothes for the mosque (women: headscarf, arms and legs covered)");
    if (ps.some((p) => /basilica|cathedral|church|vatican|duomo|st peter|st mark|sagrada|abbey|monastery/i.test(p.n))) out.push("shoulders and knees covered for churches");
    if (ps.some((p) => /cruise|boat|ferry|gondola|lagoon|canal tour|island/i.test(p.n))) out.push("a light layer for the breeze on the water");
    if (ps.some((p) => /bath|lagoon|spa\b|hammam|beach|swim/i.test(p.n + " " + p.d))) out.push("swimwear (a burkini is fine at most pools — check locally)");
    return out;
  }
  function wxData(day) {
    const w = weatherFor(day.cityId, day.date);
    if (!w) return null;
    return { w, am: w.lo + 0.35 * (w.hi - w.lo), night: w.lo + 0.25 * (w.hi - w.lo), wear: attire(w.hi, w.lo, w.rain).concat(dayExtras(day)) };
  }
  function wxLine(day) {
    const x = wxData(day);
    if (!x) return `<div class="wx muted"><span class="wx-ic">🌤</span><span>Add a start date (step 4) to see the expected weather and what to wear each day.</span></div>`;
    const w = x.w, high = day.slots.some((s) => s.type === "act" && HIGH_PLACES.test(s.p.n));
    return `<div class="wx"><span class="wx-ic" aria-hidden="true">${w.icon}</span><span><b>${w.src === "forecast" ? "Forecast" : "Typical"} for ${fmtDate(day.date)} in ${esc(day.city.name)}:</b> morning ~${deg(x.am)}, afternoon ~${deg(w.hi)}, night ~${deg(x.night)} · ${rainWords(w.rain)}${w.src === "forecast" ? ' <span class="badge rec">live forecast</span>' : ""}${high && w.mtn ? `<br>⛰ ${esc(w.mtn)}` : ""}<br><b>Wear:</b> ${esc(x.wear.join(", "))}.</span></div>`;
  }
  const wxPlain = (day) => { const x = wxData(day); return x ? `${x.w.src === "forecast" ? "Forecast" : "Typical"}: morning ~${deg(x.am)}, afternoon ~${deg(x.w.hi)}, night ~${deg(x.night)}, ${rainWords(x.w.rain)}. Wear: ${x.wear.join(", ")}.` : ""; };
  const wxCell = (d) => { const w = weatherFor(d.cityId, d.date); return w ? `${w.icon} ${Math.round(w.hi)}° / ${Math.round(w.lo)}°` : "—"; };

  // Consecutive days in the same city
  function citySegments(plan) {
    const segs = [];
    plan.days.forEach((d) => { const last = segs[segs.length - 1]; if (last && last.cid === d.cityId) last.days.push(d); else segs.push({ cid: d.cityId, city: d.city, days: [d] }); });
    return segs;
  }
  function segWeather(seg) {
    const ws = seg.days.map((d) => weatherFor(d.cityId, d.date)).filter(Boolean);
    if (!ws.length) return null;
    const avg = (k) => ws.reduce((a, w) => a + w[k], 0) / ws.length;
    const lo = Math.min.apply(null, ws.map((w) => w.lo)), rain = Math.max.apply(null, ws.map((w) => w.rain));
    const extras = [];
    seg.days.forEach((d) => dayExtras(d).forEach((e) => { if (extras.indexOf(e) < 0) extras.push(e); }));
    return { hi: avg("hi"), lo, rain, forecast: ws.some((w) => w.src === "forecast"), mtn: ws[0].mtn, pack: attire(avg("hi"), lo, rain).concat(extras) };
  }

  function weatherHTML(plan) {
    const segs = citySegments(plan);
    const dated = !!state.start;
    const range = (seg) => seg.days.length > 1 ? `${fmtDate(seg.days[0].date)} – ${fmtDate(seg.days[seg.days.length - 1].date)}` : fmtDate(seg.days[0].date);
    const summary = dated ? `<section class="panel"><h3>Your trip at a glance</h3>
      <p class="hint">Typical weather for your dates from long-term averages${segs.some((s) => (segWeather(s) || {}).forecast) ? ", with live forecasts where your dates are within about two weeks" : ""}. Check a forecast a few days before you go.</p>
      <div class="tbl-wrap"><table class="wxsum"><thead><tr><th>City</th><th>Dates</th><th>Day / night</th><th>Rain</th><th>What to pack</th></tr></thead><tbody>
      ${segs.map((s) => { const w = segWeather(s); return w ? `<tr><td><b>${flagOf(s.cid)} ${esc(s.city.name)}</b></td><td class="g-date">${range(s)}</td><td>${deg(w.hi)} / ${deg(w.lo)}</td><td>${rainWords(w.rain)}</td><td>${esc(w.pack.join(", "))}${w.mtn ? `<br><span class="hint">⛰ ${esc(w.mtn)}</span>` : ""}</td></tr>` : ""; }).join("")}
      </tbody></table></div></section>`
      : `<section class="panel"><h3>Your trip at a glance</h3><p>Add a <b>start date</b> in step 4 to see the weather for your dates, day by day, with what to wear. Until then, the tables below show each city month by month.</p></section>`;
    const tripMonths = (cid) => { const o = {}; plan.days.forEach((d) => { if (d.cityId === cid && d.date) o[d.date.getMonth()] = 1; }); return o; };
    const cities = segs.map((x) => x.cid).filter((v, i, a) => a.indexOf(v) === i);
    const panels = cities.map((cid) => {
      const c = CLIMATE[cid], tm = tripMonths(cid);
      if (!c) return "";
      return `<section class="panel"><h3>${flagOf(cid)} ${esc(CITIES[cid].name)} <span class="loc">${esc(ctry(cid).name)}</span></h3>
        <ul>${(c.notes || []).map(([ms, t]) => `<li><b>${ms.map((m) => MONTHS[m - 1]).join(", ")}:</b> ${esc(t)}</li>`).join("")}${c.mtn ? `<li><b>⛰ Up high:</b> ${esc(c.mtn)}</li>` : ""}</ul>
        <div class="tbl-wrap"><table class="wxmon"><thead><tr><th>Month</th><th>High / low</th><th>Rainy days</th><th>What to wear</th></tr></thead><tbody>
        ${c.hi.map((hi, m) => `<tr class="${tm[m] ? "trip" : ""}"><td><b>${MONTHS[m]}</b>${tm[m] ? ' <span class="badge pick">your trip</span>' : ""}</td><td>${hi}° / ${c.lo[m]}°C</td><td>${c.rain[m]}</td><td>${esc(attireShort(hi, c.lo[m], c.rain[m] / 30))}</td></tr>`).join("")}
        </tbody></table></div></section>`;
    }).join("");
    const always = `<section class="panel"><h3>Pack for every city</h3><ul>
      <li><b>Comfortable, grippy walking shoes</b> — 15–25,000 steps a day on cobblestones, stairs and hills.</li>
      <li><b>Modest clothing</b> for churches and mosques: shoulders and knees covered (the Vatican, St Mark's and Sagrada Família turn people away); a headscarf for women in mosques.</li>
      <li><b>Layers</b> — mornings and evenings are cooler than the afternoon, and trains and museums are air-conditioned.</li>
      <li><b>A compact umbrella</b> — it doubles as a sunshade in southern summers.</li>
      <li>Sunscreen, sunglasses, a refillable bottle (tap water is safe almost everywhere), and a small day bag that zips (pickpockets).</li></ul>
      <p class="hint">Temperatures are long-term averages for each date (a typical day), not forecasts — real days can be several degrees warmer or colder. Southern Europe's summer heatwaves now often exceed these averages by 5–10°C.</p></section>`;
    return summary + panels + always;
  }

  // Live forecast (Open-Meteo, free, no key) when the trip starts within ~2 weeks
  const forecastAsked = {};
  function fetchForecasts(plan) {
    if (window.NO_PRINT || !plan || !state.start || typeof fetch !== "function") return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon = plan.days.filter((d) => d.date && (d.date - today) / 86400000 >= -1 && (d.date - today) / 86400000 <= 15);
    const cids = soon.map((d) => d.cityId).filter((v, i, a) => a.indexOf(v) === i && !forecastAsked[v]);
    if (!cids.length) return;
    let pending = cids.length, added = false;
    cids.forEach((cid) => {
      forecastAsked[cid] = true;
      const ll = CITIES[cid].stay.ll;
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`)
        .then((r) => r.json()).then((j) => {
          const d = j && j.daily;
          if (!d || !d.time) return;
          d.time.forEach((t, k) => { if (d.temperature_2m_max[k] != null) { forecastCache[cid + "|" + t] = { hi: d.temperature_2m_max[k], lo: d.temperature_2m_min[k], pp: d.precipitation_probability_max[k] || 0, code: d.weather_code[k] }; added = true; } });
        }).catch(() => { /* offline or blocked: averages stay */ })
        .then(() => { if (--pending === 0 && added && lastPlan === plan) generate(false); });
    });
  }

  // One row per day for the At a glance table — interactive on screen, plain in the printout/PDF
  function glanceRows(plan, print) {
    const show = { sight: 1, travel: 1, flight: 1, custom: 1, shop: 0, rest: 1, free: 1, prayer: 0, meal: 0, cafe: 0, photo: 0, breakfast: 0, hotel: 0 };
    const label = (x) => {
      if (x.k === "flight") return "✈ " + esc(x.title.replace(/^At the airport.*$/, "Airport"));
      if (x.k === "travel") return (x.icon || "→") + " " + esc(x.title.split(": ").pop());
      return esc(String(x.title).split(/[:(]/)[0].trim());
    };
    return plan.days.map((d, i) => {
      const items = timelineFor(d, i).filter((x) => show[x.k] && !(x.k === "flight" && /^At the airport/.test(x.title)));
      const part = (lo, hi) => items.filter((x) => x.start >= lo && x.start < hi).map(label);
      const cont = (lo, hi) => items.filter((x) => x.start < lo && x.end > lo + 120 && x.k === "sight").map((x) => "↳ " + label(x));
      const cell = (arr) => (arr.length ? arr.join(" · ") : "—");
      const kind = KIND[d.kind] ? `<span class="kind-chip">${KIND[d.kind]}</span>` : "";
      if (print) {
        const h = hotelOf(d.cityId);
        return `<tr><td><b>${i + 1}</b></td><td>${d.date ? fmtDate(d.date) : "—"}</td><td class="nowrap">${wxCell(d)}</td><td><b class="nowrap">${flagOf(d.cityId)} ${esc(d.city.name)}</b>${KIND[d.kind] ? `<br><i>${KIND[d.kind]}</i>` : ""}</td>
          <td>${cell(part(0, 12 * 60 + 30))}</td><td>${cell(cont(12 * 60 + 30).concat(part(12 * 60 + 30, 18 * 60 + 30)))}</td><td>${cell(part(18 * 60 + 30, 24 * 60))}</td>
          <td>${d.kind === "depart" ? "✈ Home" : h.chosen ? esc(h.n) : esc(d.city.name)}</td></tr>`;
      }
      return `<tr data-goto="day-${i + 1}" tabindex="0" role="link" aria-label="Go to day ${i + 1}">
        <td class="g-day"><b>${i + 1}</b></td>
        <td class="g-date">${d.date ? fmtDate(d.date) : "—"}</td>
        <td class="g-wx">${wxCell(d)}</td>
        <td><b>${esc(d.city.name)}</b> ${ctry(d.cityId).flag}${kind}${isEdited(d, i) ? '<span class="kind-chip edited">edited</span>' : ""}</td>
        <td>${cell(part(0, 12 * 60 + 30))}</td><td>${cell(cont(12 * 60 + 30).concat(part(12 * 60 + 30, 18 * 60 + 30)))}</td><td>${cell(part(18 * 60 + 30, 24 * 60))}</td>
        <td class="g-sleep">${d.kind === "depart" ? "✈ Home" : hotelOf(d.cityId).chosen ? esc(hotelOf(d.cityId).n) : esc(d.city.name)}</td></tr>`;
    });
  }
  // Printed At a glance pages: 16 days a page, a short tail joins the previous page
  function glancePageCount(n) { let c = Math.ceil(n / 16); if (c > 1 && n - (c - 1) * 16 < 4) c--; return c; }
  function glanceHTML(plan) {
    const rows = glanceRows(plan).join("");
    return `<section class="panel glance">
      <h3>At a glance</h3>
      ${state.start ? "" : `<p class="hint">Add a start date (step 4) to see the dates and weekdays here.</p>`}
      <div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Date</th><th>Weather</th><th>City</th><th>Morning</th><th>Afternoon</th><th>Evening</th><th>Sleep in</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Tap a day to jump to its hour-by-hour plan, where you can edit times and add or remove anything.</p>
    </section>`;
  }

  function generate(scroll) {
    readForm();
    const plan = buildPlan(state);
    applyPlanned(plan);
    lastPlan = plan;
    editingDay = null;
    plan.map = routeMapSVG(plan);
    lmap = null;
    const ids = state.stops.map((s) => s.city);
    const arrId = plan.arriveId, depId = plan.departId;
    const routeIds = [arrId, ...ids, depId];
    const routeCountries = routeIds.map((i) => CITIES[i].country).filter((v, i, a) => a.indexOf(v) === i);
    const langs = routeCountries.map((c) => COUNTRIES[c].lang).filter((v, i, a) => v !== "en" && a.indexOf(v) === i);
    const zones = zoneNights();

    // Summary
    const route = `<span class="n">✈ ${fromSyd() ? "Sydney" : ""}${arrId !== ids[0] ? (fromSyd() ? " → " : "") + esc(CITIES[arrId].name) : ""}</span><span class="arrow">→</span> ` +
      state.stops.map((s, i) => `${i ? '<span class="arrow">→</span>' : ""}<span class="stopname">${esc(CITIES[s.city].name)}</span><span class="n">${ctry(s.city).flag} ${s.nights}N</span>`).join(" ") +
      ` <span class="arrow">→</span><span class="n">✈ ${depId !== ids[ids.length - 1] ? esc(CITIES[depId].name) + (fromSyd() ? " → " : "") : ""}${fromSyd() ? "Sydney" : ""}</span>`;
    const typeLabels = state.types.map((t) => TRIP_TYPES.find((x) => x.id === t).label).concat(state.other ? [state.other] : []);
    const b = BUDGET[state.budget];
    const startD = state.start ? new Date(state.start + "T00:00:00") : null;
    const endD = startD ? new Date(startD.getTime() + (state.days - 1) * 86400000) : null;

    const notes = [];
    if (isExample) notes.push(["info", "Example", "This is a sample 14-day trip through France, Switzerland and Italy. Pick your own countries, cities and nights on the left and press <b>Build my itinerary</b>."]);
    if (reordered) notes.push(["info", "Route", `Cities re-ordered so you start in ${esc(CITIES[arrId].name)}, finish near ${esc(CITIES[depId].name)} and travel the shortest way between them. Untick “Recommend the best city order and transport” to keep your own order.`]);
    reordered = false;
    plan.warnings.forEach((w) => notes.push(["warn", "Check", esc(w)]));
    routeCountries.filter((c) => COUNTRIES[c].warn).forEach((c) => notes.push(["warn", "Safety", `${COUNTRIES[c].flag} ${COUNTRIES[c].warn}`]));
    // Entry rules, zone by zone
    if (zones.schengen) {
      const sch = zones.schengen + 1;
      const main = state.stops.filter((st) => ctry(st.city).region === "schengen").reduce((acc, st) => { const c = CITIES[st.city].country; acc[c] = (acc[c] || 0) + st.nights; return acc; }, {});
      const mainC = Object.keys(main).sort((a, b) => main[b] - main[a])[0];
      if (isAU()) notes.push(sch > 90
        ? ["warn", "Visa", `You'd spend about <b>${sch} days</b> in the Schengen Area — over the limit for Australians of <b>90 days in any 180</b>, counted across all Schengen countries together. Shorten the Schengen part, or move days to the UK, Türkiye or Bosnia & Herzegovina (outside Schengen).`]
        : ["good", "Visa", `🇪🇺 No visa needed: Australians can spend up to <b>90 days in any 180</b> in the Schengen Area (all Schengen countries combined) — this trip uses about ${sch}. On your first entry you'll be fingerprinted and photographed for the EU Entry/Exit System (fully live since April 2026). ETIAS, the online pre-travel approval, isn't running yet — it's now expected in 2027, so check before you fly.`]);
      else notes.push(["warn", "Visa", `Your route is mostly in the Schengen Area. If your passport needs a Schengen visa, apply to <b>${esc(COUNTRIES[mainC].name)}</b> (where you spend the most nights), up to 6 months and at least 15 days before travel; the fee is €90. Bring travel insurance with at least €30,000 medical cover, bookings and bank statements — this itinerary printout helps.`]);
    }
    if (zones.uk) notes.push(["info", "Visa", isAU()
      ? "🇬🇧 United Kingdom: Australians need an <b>Electronic Travel Authorisation (ETA)</b> before travelling — £20 (since April 2026) in the official UK ETA app, usually approved within 3 working days, valid for 2 years for stays of up to 6 months. Apply before you book non-refundable travel."
      : "🇬🇧 United Kingdom: visitors who don't need a visa (including EU citizens) need a UK ETA (£20) before travelling; everyone else needs a visa."]);
    if (zones.tr) notes.push(["info", "Visa", isAU()
      ? "🇹🇷 Türkiye: Australians have been <b>visa-free since 17 April 2026</b> (up to 90 days in 180). Many older guides still say you need an e-Visa — confirm on Smartraveller before you fly."
      : "🇹🇷 Türkiye: many passports are visa-free; others need an e-Visa — apply only on the official site, evisa.gov.tr."]);
    Object.keys(REGIONS).forEach((r) => { if (zones[r]) notes.push([r === "ru" ? "warn" : "info", "Visa", (COUNTRIES[r] ? COUNTRIES[r].flag + " " : "") + (isAU() ? REGIONS[r].au : REGIONS[r].other)]); });
    if (fromSyd()) {
      const same = arrId === depId;
      notes.push(["info", "Flights", `Book ${same ? "a return" : "a <b>multi-city (open-jaw)</b>"} ticket: Sydney → ${esc(CITIES[arrId].name)}${same ? " and back" : `, then ${esc(CITIES[depId].name)} → Sydney`}. There are no nonstop flights to Europe until Qantas launches Sydney–London (announced for October 2027): expect one stop and 22–26 h. Emirates, Qatar Airways and Etihad serve halal meals on every flight. Details are on day 1 and the last day.`]);
    }
    {
      const fl = state.flights || {};
      const bits = [];
      if (fl.inTime) bits.push(`lands in ${esc(CITIES[arrId].name)} at <b>${esc(fl.inTime)}</b>${fl.inNo ? " (" + esc(fl.inNo) + ")" : ""}`);
      if (fl.outTime) bits.push(`flight home leaves ${esc(CITIES[depId].name)} at <b>${esc(fl.outTime)}</b>${fl.outNo ? " (" + esc(fl.outNo) + ")" : ""}`);
      if (bits.length) notes.push(["info", "Times", bits.join("; ").replace(/^./, (c) => c.toUpperCase()) + ". Day 1 and the last day are planned around these."]);
      else notes.push(["info", "Times", "Add your landing and take-off times (step 4), and train or flight times on each city card, to plan arrival and travel days to the hour."]);
    }
    if (startD) {
      const touches = (mo, d1, d2) => { for (let i = 0; i < state.days; i++) { const x = new Date(startD.getTime() + i * 86400000); if (x.getMonth() === mo && x.getDate() >= d1 && x.getDate() <= d2) return true; } return false; };
      const inRange = (a, b) => { const A = new Date(a + "T00:00:00"), B = new Date(b + "T23:59:59"); return startD <= B && endD >= A; };
      const months = []; for (let i = 0; i < state.days; i += 7) months.push(new Date(startD.getTime() + i * 86400000).getMonth());
      months.push(endD.getMonth());
      const anyM = (arr) => months.some((m) => arr.includes(m));
      const south = routeIds.some((i) => ["it", "es", "gr", "pt", "hr", "tr"].includes(CITIES[i].country));
      if (anyM([6, 7])) notes.push(["warn", "Season", `July–August is peak season: big crowds, top prices${south ? " and heatwaves (often 35–40 °C+ in Italy, Spain, Greece and Croatia)" : ""}. Book timed tickets early and plan outdoor sights for the morning.${routeIds.some((i) => ["it", "fr"].includes(CITIES[i].country)) ? " Around 15 August (Ferragosto in Italy, the Assumption in France) many family-run shops and restaurants close." : ""}`]);
      if (touches(11, 24, 26) || touches(0, 1, 1)) notes.push(["warn", "Holiday", "Your dates include Christmas or New Year's Day: most museums, shops and some transport close or run reduced hours on 24–26 December and 1 January. Late November to 23 December is Christmas-market season (Vienna, Munich, Prague, Strasbourg, Budapest…)."]);
      else if (touches(10, 20, 30) || touches(11, 1, 23)) notes.push(["good", "Season", "Christmas-market season: Vienna, Munich, Prague, Budapest, Zurich and Brussels light up. Look for non-alcoholic punch (Kinderpunsch) instead of mulled wine."]);
      if (anyM([10, 11, 0, 1, 2]) && routeIds.some((i) => ["int", "lzn", "zrh", "szg", "muc"].includes(i))) notes.push(["info", "Weather", "Alpine winter: some mountain railways and hikes close (e.g. Pilatus's cogwheel railway runs only May–November) — Jungfraujoch and Titlis stay open. Pack warm, waterproof layers."]);
      const north = routeIds.some((i) => ["no", "se", "fi", "is", "dk", "ee", "lv", "lt", "ru"].includes(CITIES[i].country));
      if (anyM([10, 11, 0, 1]) && north) notes.push(["info", "Season", "Northern winter: only about 6 h of daylight in Oslo, Stockholm and Helsinki in December (4–5 h in Reykjavík), and temperatures below 0 °C — but it's Northern Lights season (Iceland, northern Norway) and Christmas markets glow."]);
      if (anyM([4, 5, 6]) && north) notes.push(["info", "Prayer", "Midsummer in the north: it barely gets dark (white nights), so Isha and Fajr times are hard to calculate. Use a high-latitude method in Muslim Pro, or follow the local mosque's timetable."]);
      if (anyM([10, 11, 0, 1, 2]) && routeIds.includes("jtr")) notes.push(["warn", "Season", "Santorini in winter: many hotels, restaurants and boat trips close from November to March, and ferries are fewer."]);
      if (inRange("2027-02-08", "2027-03-09") || inRange("2028-01-28", "2028-02-26")) notes.push(["info", "Ramadan", "Your trip overlaps Ramadan (expected around 8 Feb – 9 Mar 2027 / 28 Jan – 26 Feb 2028; it depends on the moon sighting). Winter fasts in Europe are short. Istanbul and Sarajevo are wonderful for iftar; elsewhere, mosques often hold community iftars."]);
      if (inRange("2027-05-15", "2027-05-18")) notes.push(["info", "Eid", "Eid al-Adha is expected around 16 May 2027 — plan Eid prayer at the nearest large mosque."]);
    }
    {
      const open = plan.map.legs.filter((l) => l.mode === "unset");
      const auto = plan.map.legs.filter((l) => legInfo(l.a.id, l.b.id).auto);
      if (auto.length) notes.push(["good", "Transport", `Recommended for you: ${auto.map((l) => esc(CITIES[l.a.id].name) + " → " + esc(CITIES[l.b.id].name) + " by " + MODE[l.mode].label.toLowerCase()).join("; ")}. Each travel day explains why and compares the alternatives; change any of them with “Getting here” on the city cards.`]);
      if (open.length) notes.push(["info", "Transport", `${open.length} of ${plan.map.legs.length} journeys between cities have no transport chosen yet (${open.map((l) => esc(CITIES[l.a.id].name) + " → " + esc(CITIES[l.b.id].name)).join(", ")}). Pick train, flight, coach, car or ferry on each city card — or tick “Recommend the best city order and transport” in step 4 and the planner will choose.`]);
    }
    {
      const ed = plan.days.filter((d, i) => isEdited(d, i)).length;
      if (ed) notes.push(["info", "Your edits", `${ed} day${ed > 1 ? "s have" : " has"} your own changes, kept even if you rebuild. Use “Reset day” on a day to go back to the suggestion.`]);
    }
    {
      const w = parseWishes(state.wishes);
      if (wishSummary(w)) {
        const skipped = [];
        state.stops.forEach((st) => CITIES[st.city].places.forEach((p) => { if (!st.places.includes(p.id) && wishExcluded(p, w) && p.r >= 2 && skipped.indexOf(p.n) < 0) skipped.push(p.n); }));
        const keptAnyway = [];
        state.stops.forEach((st) => st.places.forEach((id) => { const p = CITIES[st.city].places.find((x) => x.id === id); if (p && wishExcluded(p, w)) keptAnyway.push(p.n); }));
        notes.push(["good", "Your wishes", `Planned with ${esc(wishSummary(w))}.${skipped.length ? ` Left out: ${esc(skipped.slice(0, 8).join(", "))}${skipped.length > 8 ? ` and ${skipped.length - 8} more` : ""}.` : ""}${keptAnyway.length ? ` Kept because you picked them: ${esc(keptAnyway.join(", "))}.` : ""} Activities that match are marked “Matches your wishes”.`]);
      }
    }
    (plan.report || []).forEach((x) => notes.push([x.ok ? "good" : "warn", x.kind === "trip" ? "Day trip" : "Request",
      `<b>${esc(x.label)}</b> — ${x.ok ? esc(x.summary || x.msg) + (x.day != null ? ` <a href="#day-${x.day + 1}" data-goto="day-${x.day + 1}">See day ${x.day + 1} ↓</a>` : "") : esc(x.msg)}${(x.warns || []).map((w) => "<br>⚠️ " + esc(w)).join("")}${x.moved ? "<br>" + esc(x.moved) : ""}${x.gone && x.gone.length ? "<br>Makes way by moving out: " + esc(x.gone.join(", ")) + " — add a night or another day for them." : ""}${x.ok && x.msg && x.summary ? "<br>" + esc(x.msg) : ""}`]));
    notes.push(["good", "Halal", "Every activity lists the nearest halal food we know of, and each afternoon includes a café stop and a photo spot. 'Halal' isn't regulated the same way everywhere in Europe — ask the staff and look for a certificate, as owners change."]);

    const hdr = `<div class="summary">
      <div class="eyebrow">${isExample ? "Example itinerary" : "Your itinerary"} · ${state.days} days${startD ? ` · ${fmtDate(startD)} – ${fmtDate(endD)}` : ""}</div>
      <h2>${esc(typeLabels.length ? typeLabels.join(", ") : "All-round")} trip through ${esc(state.stops.map((s) => CITIES[s.city].name).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</h2>
      <div class="flags">${routeCountries.map((c) => `<span>${COUNTRIES[c].flag} ${esc(COUNTRIES[c].name)}</span>`).join("")}</div>
      <div class="route">${route}</div>
      <div class="map-wrap map-summary">${plan.map.svg}</div>
      <div class="map-legend">${plan.map.legend}<button type="button" class="btn small" data-tab="map">Open the map tab for street maps →</button></div>
      <div class="facts">
        <div class="fact"><b>${state.days} days / ${state.days - 1} nights</b><span>Length</span></div>
        <div class="fact"><b>${state.stops.length} ${state.stops.length === 1 ? "city" : "cities"} · ${routeCountries.length} ${routeCountries.length === 1 ? "country" : "countries"}</b><span>Stops</span></div>
        <div class="fact"><b>${b.day}</b><span>${b.label} / person / day, incl. hotel share${routeIds.some((i) => ["gb", "ch"].includes(CITIES[i].country)) ? " · London & Switzerland ~30% more" : ""}</span></div>
        <div class="fact"><b>${state.pace === "relaxed" ? "Relaxed" : "Balanced"}</b><span>Pace</span></div>
      </div>
      ${state.aud !== false ? `<p class="hint no-aud">≈A$ amounts use €1 = A$${(+state.eurAud).toFixed(2)}${state.eurAudSet ? " (your rate)" : ` (mid-market rate checked ${refreshedLabel})`} — change it in the form's Extras. They're estimates — your card's rate and fees will differ slightly.</p>` : ""}
      <div class="notes">${notes.map(([k, t, h]) => `<div class="note ${k}"><b class="tag">${t}</b><span>${h}</span></div>`).join("")}</div>
      <div class="actions"><button type="button" class="btn print-btn" data-print>🖨 Print itinerary & info (${plan.days.length + 5 + glancePageCount(plan.days.length)} pages)</button><button type="button" class="btn" data-pdf>📄 Download PDF</button><button type="button" class="btn" data-save>📲 Save to phone (offline copy)</button><button type="button" class="btn" id="copyPlan">Copy itinerary as text</button></div>
    </div>`;

    const tabs = `<div class="tabs" role="tablist">
      ${[["plan", "Day by day"], ["map", "Map"], ["wx", "Weather & what to wear"], ["stay", "Hotels, food & cafés"], ["prep", "Before you go"], ["talk", "Phrases"]].map(([id, l]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${currentTab === id}" aria-controls="pane-${id}" data-tab="${id}">${l}</button>`).join("")}
    </div>`;

    // Day by day
    let html = `<div id="glanceBox">${glanceHTML(plan)}</div>`, n = 0;
    plan.days.forEach((day, i) => {
      if (day.kind !== "full" && day.kind !== "depart") {
        const st = state.stops[n];
        html += `<div class="city-band"><h3>${esc(day.city.name)}</h3><span class="loc">${ctry(day.cityId).flag} ${esc(ctry(day.cityId).name)}</span><span class="meta">${st ? st.nights + " night" + (st.nights > 1 ? "s" : "") : ""}</span></div>
          <p class="city-stay">${esc(day.city.intro)} ${hotelOf(day.cityId).chosen ? `<b>🏨 Your hotel:</b> ${esc(hotelOf(day.cityId).n)} (${esc(fromCentre(day.city, hotelOf(day.cityId).ll))}) — all directions start from here.` : `<b>Stay:</b> ${esc(day.city.stay.area)}. ${esc(day.city.stay.why)} <b>Booked a hotel?</b> Choose it on the ${esc(day.city.name)} card or in the <a href="#" data-tab="stay">Hotels tab</a> and the plan is re-worked from it.`}</p>
          <p class="city-stay"><b>Top rated here:</b> ${day.city.places.filter((p) => p.r === 3).map((p) => plan.stops[n].used.has(p.id) ? `${esc(p.n)} <span style="color:var(--jade)">✓ in your plan</span>` : `${esc(p.n)} <i>(not in this plan — add a night)</i>`).join(" · ")}</p>
          <p class="city-stay"><b>☕ Cafés:</b> ${(day.city.cafes || []).map((c) => esc(c.n)).join(" · ")}<br><b>📸 Photo spots:</b> ${(day.city.insta || []).map((x) => `${esc(x.n)} <i>(${esc(x.when)})</i>`).join(" · ")}</p>`;
        n++;
      }
      html += `<article class="day" id="day-${i + 1}" data-cur="${curOf(day.cityId)}">
        <div class="day-num"><div class="stamp">${i + 1}</div><small>Day ${i + 1}${day.date ? "<br>" + fmtDate(day.date) : ""}</small></div>
        <div class="day-body"><h4 class="day-title"><span class="dflag">${flagOf(day.cityId)}</span> ${esc(dayTitle(day))}${KIND[day.kind] ? `<span class="kind">${KIND[day.kind]}</span>` : ""}</h4>
          ${wxLine(day)}
          <div class="tl" id="tl-${i}">${timelineHTML(i)}</div>
          <h5 class="details-h">Details, directions, halal food & photo spots</h5>
          ${day.slots.map((s) => slotHTML(s, day)).join("")}
          ${day.back && day.kind !== "depart" ? `<div class="back"><b>Back to the hotel:</b> ${day.back.text}</div>` : ""}
          ${googleDayLink(day) ? `<div class="maplinks"><a href="${googleDayLink(day)}" target="_blank" rel="noopener">🗺 Open this day's route in Google Maps ↗</a><a href="#" data-tab="map" data-mapday-open="${i}">See it on the map</a></div>` : ""}
        </div></article>`;
    });

    const out = $("#out");
    out.innerHTML = hdr + askHTML(plan) + tabs +
      `<div id="pane-plan" role="tabpanel" aria-labelledby="tab-plan" class="out" ${currentTab !== "plan" ? "hidden" : ""}><h2 class="print-only">Day-by-day itinerary</h2>${html}</div>
       <div id="pane-map" role="tabpanel" aria-labelledby="tab-map" class="out" ${currentTab !== "map" ? "hidden" : ""}><h2 class="print-only">Map</h2>${mapPaneHTML(plan)}</div>
       <div id="pane-wx" role="tabpanel" aria-labelledby="tab-wx" class="out" ${currentTab !== "wx" ? "hidden" : ""}><h2 class="print-only">Weather & what to wear</h2>${weatherHTML(plan)}</div>
       <div id="pane-stay" role="tabpanel" aria-labelledby="tab-stay" class="out" ${currentTab !== "stay" ? "hidden" : ""}><h2 class="print-only">Hotels, halal food, cafés & photo spots</h2>${stayHTML(ids)}</div>
       <div id="pane-prep" role="tabpanel" aria-labelledby="tab-prep" class="out" ${currentTab !== "prep" ? "hidden" : ""}><h2 class="print-only">Before you go</h2>${prepHTML(routeIds, zones)}</div>
       <div id="pane-talk" role="tabpanel" aria-labelledby="tab-talk" class="out" ${currentTab !== "talk" ? "hidden" : ""}><h2 class="print-only">Phrases</h2>${phrasesHTML(langs)}</div>
       <p class="foot"><b>${esc(refreshLine())}</b> Prices, opening hours and visa rules change. Figures here are typical for 2025–26 and meant for planning; confirm bookings and entry rules on official sites before you travel. Directions are estimates from map distance — use Google Maps or Citymapper on the day for live routes.</p>`;
    audifyIn(out);
    restoreChecks();
    plan.days.forEach((d, i) => { if (isEdited(d, i) || d.base) { const pids = new Set(timelineFor(d, i).map((x) => x.pid).filter(Boolean)); document.querySelectorAll(`#day-${i + 1} .slot[data-pid]`).forEach((sl) => (sl.hidden = !pids.has(sl.dataset.pid))); } });
    if (currentTab === "map") showStreetMap();
    lastPrintArgs = { ids, routeIds, arrId, depId, langs, zones, startD, endD, notes };
    fetchForecasts(plan);
    renderAskHistory();
    if (askDraft) renderAskPreview();
    renderReqPreview();
    buildPrintView(plan, lastPrintArgs);
    if (scroll) out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stayHTML(ids) {
    const uniq = ids.filter((v, i, a) => a.indexOf(v) === i);
    return uniq.map((id) => {
      const c = CITIES[id], co = COUNTRIES[c.country];
      const mine = hotelOf(id);
      const hotels = c.hotels.map((h) => {
        const isMine = mine.chosen && mine.n === h.n;
        return `<div class="hotel ${isMine ? "pick" : ""}"><span class="tier">${PICK_LABEL[h.tier]}${h.tier === BUDGET_PICK[state.budget] ? " · matches your budget" : ""}</span><b>${esc(h.n)}</b>
          <span>${esc(h.area)} · ${esc(fromCentre(c, h.ll))}</span><span class="price">${esc(priceText(c, h))}</span><span>${esc(h.note)}</span>
          ${isMine ? '<span class="badge pick">✓ Your hotel — the plan starts from here</span>' : `<button type="button" class="btn small" data-choosehotel="${id}|${h.tier}">Choose this hotel</button>`}
          <a class="hint" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.n + " " + c.name)}" target="_blank" rel="noopener">Reviews & map ↗</a></div>`;
      }).join("") + (mine.chosen && mine.pick === "custom" ? `<div class="hotel pick"><span class="tier">Your own hotel</span><b>${esc(mine.n)}</b><span>${esc(fromCentre(c, mine.ll))}</span><span class="badge pick">✓ Your hotel — the plan starts from here</span></div>` : "");
      const halal = c.halal.map((h) => `<li><b>${esc(h.n)}</b> — ${esc(h.note)}</li>`).join("");
      const mosques = c.mosques.length ? `<h4>Mosques</h4><ul>${c.mosques.map((m) => `<li><b>${esc(m.n)}</b> — ${esc(m.note)}</li>`).join("")}</ul>` : `<h4>Mosques</h4><p>No mosque listed here; search “mosque” in Google Maps and use Muslim Pro for prayer times and qibla.</p>`;
      return `<section class="panel" data-cur="${curOf(id)}">
        <h3>${esc(c.name)} <span class="loc">${co.flag} ${esc(co.name)}</span></h3>
        <p>${esc(c.intro)}</p>
        <p class="hint">We suggest <b>${c.nightsRec} night${c.nightsRec > 1 ? "s" : ""}</b> here. Money: ${esc(co.cur)}.</p>
        <h4>Best area to stay</h4><p><b>${esc(c.stay.area)}.</b> ${esc(c.stay.why)}</p>
        <h4>Hotels — our three picks</h4><p class="hint">All three have consistently good guest reviews. Prices are typical for a double room per night and swing with season — check current reviews and rates before booking. Already booked something else? Choose “Another hotel” on the ${esc(c.name)} card in the form.</p><div class="hotels">${hotels}</div>
        <p class="hint">Book on Booking.com, Expedia or direct. Most European cities add a tourist tax per person per night (about €1–10), paid at the hotel. Older buildings often have no lift — ask if that matters.</p>
        <h4>Top-rated things to do</h4><ul>${c.places.filter((p) => p.r >= 2 && !p.insta && !p.custom).sort((a, b) => b.r - a.r).map((p) => `<li><b>${esc(p.n)}</b> <span style="color:var(--gold)">${"★".repeat(p.r)}</span> — ${esc(p.d.split(". ")[0].replace(/\.$/, ""))}. <span class="hint">${esc(p.h)} · ${esc(p.c)}</span></li>`).join("")}</ul>
        <h4>Halal food</h4><ul>${halal}</ul><p>${esc(c.halalTip)}</p>
        ${mosques}
        <h4>☕ Cafés & desserts</h4><ul>${(c.cafes || []).map((x) => `<li><b>${esc(x.n)}</b> — ${esc(x.note)}</li>`).join("")}</ul>
        <h4>📸 Instagram-worthy spots</h4><ul>${(c.insta || []).map((x) => `<li><b>${esc(x.n)}</b> — ${esc(x.note)} <span class="hint">Best: ${esc(x.when)}</span></li>`).join("")}</ul>
        <h4>Local food to try (halal-friendly)</h4><ul>${c.dishes.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        <h4>Getting around</h4><p>${esc(c.getAround)}</p>
        <h4>Arriving</h4><p>${esc(c.arrive)}</p>
        <h4>Leaving</h4><p>${esc(c.depart)}</p>
      </section>`;
    }).join("");
  }

  /* ---------- before you go ---------- */
  const onRoute = (cc) => (lastPlan ? [lastPlan.arriveId].concat(state.stops.map((x) => x.city), [lastPlan.departId]) : state.stops.map((x) => x.city)).some((i) => CITIES[i].country === cc);
  function checklistItems() {
    const z = zoneNights();
    return [
      "Passport valid for at least 3 months after you leave the Schengen Area (6 months is safer), issued in the last 10 years, with 2 blank pages",
      isAU() ? "Keep your Schengen days under 90 in any 180 (all Schengen countries count together)" : "Check visa rules for your passport (Schengen, UK, Türkiye) and apply early if needed",
      ...(isAU() ? ["Register on Smartraveller and subscribe to updates for every country you visit", "Save the Consular Emergency Centre number: +61 2 6261 3305"] : []),
      ...(z.uk || onRoute("gb") ? [isAU() ? "Apply for the UK ETA (£20) in the official UK ETA app before booking non-refundable travel" : "UK: apply for a UK ETA or visa before travelling"] : []),
      fromSyd() ? "Book a multi-city (open-jaw) flight from Sydney: into your first city, out of your last" : "Book flights in and out",
      "Book high-speed trains and budget flights early — fares rise as the date approaches",
      "Book timed tickets for headline sights (Louvre, Vatican, Colosseum, Last Supper, Sagrada Família, Alhambra, Anne Frank House, Acropolis…) as soon as they open",
      "Travel insurance with medical evacuation; check it covers skiing, hiking or paragliding if you plan them",
      "Travel eSIM or a roaming pack — EU 'roam like at home' doesn't apply to Australian SIMs",
      "Low-fee travel card (e.g. Wise, Revolut, ING, Macquarie, Up) plus a backup card; a little cash in € (and the local currency for non-euro countries on your route)",
      "Plug adapters: Type C/F for most of Europe, Type G for the UK; Type C also fits Swiss and Italian sockets",
      "Download offline Google Maps, Google Translate languages and the rail apps you'll use",
      "Comfortable walking shoes (cobblestones and hills) and a light scarf or layer for churches and mosques",
      "Copies of passport, insurance and bookings: on paper and on your phone",
      "Prescription medicines in original packaging with a doctor's letter",
      "Prayer mat, qibla app and halal snacks for day trips and mountain days",
    ];
  }

  function prepHTML(ids, zones) {
    const checklist = checklistItems();
    const au = isAU();
    const banned = [["fr", "France"], ["be", "Belgium"], ["at", "Austria"], ["ch", "Switzerland (nationwide since 1 January 2025)"], ["nl", "the Netherlands (on public transport and in schools, hospitals and government buildings)"], ["dk", "Denmark"], ["bg", "Bulgaria"]].filter(([c]) => onRoute(c));
    return `
    <section class="panel">
      <h3>Visas & entry</h3>
      ${zones.schengen ? (au ? `<h4>🇪🇺 Schengen Area — Australian passport</h4>
      <ul>
        <li><b>No visa needed for up to 90 days in any 180-day period</b>, for tourism or visiting family. The 90 days are counted across <b>all 29 Schengen countries together</b> (in this planner: ${Object.keys(COUNTRIES).filter((c) => COUNTRIES[c].region === "schengen").map((c) => COUNTRIES[c].name).join(", ")}).</li>
        <li><b>Entry/Exit System (EES):</b> since 10 April 2026 your fingerprints and a photo are recorded the first time you enter, and every entry and exit is logged digitally instead of stamped. Allow extra time at your first border.</li>
        <li><b>ETIAS</b> (an online travel authorisation, about €20, valid 3 years) is <b>not yet required</b>. The EU dropped its late-2026 target and hasn't announced a new start date (widely expected in 2027, with a transition period); it will give several months' notice. Check travel-europe.europa.eu before you fly — and use only that official site.</li>
        <li>Your passport must be valid for 3 months after you leave Schengen and issued within the last 10 years. Border officers may ask for your return ticket, accommodation and funds.</li>
        <li>Australia has older bilateral agreements with some Schengen countries that can allow extra time in that one country; they're complicated — ask that country's embassy before relying on one.</li>
      </ul>` : `<h4>🇪🇺 Schengen Area</h4>
      <ol>
        <li><b>Visa-free (90 days in any 180):</b> citizens of the UK, US, Canada, Australia, New Zealand, Japan, South Korea, Singapore, Malaysia, the UAE, Brazil and many others. You'll be registered in the Entry/Exit System (fingerprints and photo) on first entry; ETIAS isn't required yet (expected 2027).</li>
        <li><b>Schengen visa (type C):</b> needed by many passports, e.g. India, Pakistan, Indonesia, the Philippines, China, Türkiye, Saudi Arabia, Egypt.
          <ul>
            <li>Apply to the country where you'll spend the most nights (if equal, the first one you enter), through its consulate or its visa centre (VFS Global, TLScontact, BLS).</li>
            <li>Apply up to 6 months and at least 15 days before travel; fee €90 (children 6–11: €45).</li>
            <li>Bring: passport (valid 3+ months after the trip, 2 blank pages), photo, flight bookings, hotel bookings or this itinerary, travel insurance with at least €30,000 medical cover valid across Schengen, bank statements, and proof of employment or study.</li>
          </ul></li>
      </ol>`) : ""}
      ${zones.uk ? (au ? `<h4>🇬🇧 United Kingdom</h4><p>Australians need an <b>Electronic Travel Authorisation (ETA)</b>: £20 since April 2026, applied for in the official UK ETA app or on GOV.UK (beware look-alike sites). Usually approved within 3 working days, valid 2 years, stays of up to 6 months. Australians can use the eGates at the border. The UK isn't in Schengen — days there don't count towards your 90.</p>`
        : `<h4>🇬🇧 United Kingdom</h4><p>Visitors who don't need a visa — including EU, US and Canadian citizens — need a UK ETA (£20) before travelling. Others need a Standard Visitor visa (apply on GOV.UK).</p>`) : ""}
      ${zones.tr ? (au ? `<h4>🇹🇷 Türkiye</h4><p><b>Visa-free for Australians since 17 April 2026</b> for tourism, up to 90 days in any 180 days. Many websites (and older consulate pages) still say an e-Visa is needed — check Smartraveller's Türkiye page before you fly. Passport valid 150 days beyond arrival.</p>`
        : `<h4>🇹🇷 Türkiye</h4><p>Many nationalities are visa-free; others need an e-Visa, applied for only on the official site evisa.gov.tr (agent sites charge more).</p>`) : ""}
      ${Object.keys(REGIONS).filter((r) => zones[r]).map((r) => `<h4>${COUNTRIES[r] ? COUNTRIES[r].flag + " " : ""}${esc(REGIONS[r].name)}</h4><p>${au ? REGIONS[r].au : REGIONS[r].other}</p>`).join("")}
      ${banned.length ? `<div class="note warn"><b class="tag">Good to know</b><span><b>Face-covering laws:</b> wearing a face covering such as the niqab or burqa in public is banned in ${banned.map((b) => b[1]).join("; ")}, with fines. Headscarves (hijab) are not affected.</span></div>` : ""}
    </section>

    ${fromSyd() ? flightsPanel(ids, lastPlan.arriveId, lastPlan.departId) : ""}
    ${au ? ausPanel(ids) : ""}
    <section class="panel">
      <h3>Insurance</h3>
      <ul>
        ${au ? `<li><b>Reciprocal Health Care:</b> Australia has agreements with the UK, Ireland, the Netherlands, Belgium, Italy, Malta, Slovenia, Sweden, Finland and Norway. They cover medically necessary treatment in the <i>public</i> system only — not private hospitals, evacuation or getting you home — so you still need travel insurance. Everywhere else, Medicare doesn't cover you at all.</li>` : ""}
        <li>For a Schengen visa, insurance with at least €30,000 medical cover is compulsory; for everyone else it's strongly recommended.</li>
        <li>Look for: medical cover (aim for A$/US$1 million+), emergency evacuation, cancellation and delays, baggage, and phone theft (pickpocketing is common in Paris, Barcelona and Rome).</li>
        <li><b>Adventure add-ons:</b> skiing, paragliding (Interlaken), canyoning, high-altitude hiking and hire cars often need extra cover.</li>
        <li>${au ? "Australian options to compare: Cover-More, Allianz, World Nomads, Fast Cover, Southern Cross, or your credit card's complimentary cover (usually only if you paid the trip on that card). Declare pre-existing conditions." : "Compare World Nomads, SafetyWing, Allianz Travel, or your credit card's cover."} Read the exclusions.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Apps to install before you fly</h3>
      <div class="apps">
        ${[
          ["must", "Google Maps + Citymapper", "Walking and public transport directions; download offline areas for each city."],
          ["must", "Trainline or Omio", "Trains and coaches across Europe in one app, in English."],
          ["must", "The rail apps for your route", "SNCF Connect (France), Trenitalia & Italo (Italy), DB Navigator (Germany), SBB Mobile (Switzerland), ÖBB (Austria), Renfe (Spain), Eurostar — often cheaper and show platforms and delays."],
          ["must", "Uber, Bolt and FreeNow", "Ride-hailing works in most cities (Bolt is cheapest in Prague and Budapest; FreeNow and itTaxi book licensed taxis in Rome)."],
          ["must", "Muslim Pro or Athan", "Prayer times, qibla and nearby mosques."],
          ["must", "Zabihah or HalalTrip", "Crowd-sourced halal restaurant listings with reviews."],
          ["must", "Google Translate", "Download offline packs; camera mode reads menus and ingredient lists."],
          ["must", "Travel eSIM (Airalo, Holafly, Nomad…)", "Cheap data across Europe; buy a multi-country plan."],
          ["nice", "GetYourGuide / Tiqets", "Timed tickets and tours — but book headline sights on the official site first."],
          ["nice", "TheFork", "Restaurant bookings and discounts (France, Italy, Spain, Portugal)."],
          ["nice", "Skyscanner / Google Flights", "Find budget flights; book direct with the airline."],
          ["nice", "Wise / Revolut", "Low-fee multi-currency cards that work with Apple/Google Pay."],
          ["nice", "XE Currency", "Quick currency conversions for every country on your route."],
        ].map(([k, n, d]) => `<div class="app"><span class="tag ${k}">${k === "must" ? "Essential" : "Useful"}</span><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join("")}
      </div>
    </section>

    <section class="panel">
      <h3>Money & payments</h3>
      <ul>
        <li><b>Contactless cards and phone wallets work almost everywhere</b>, including metro gates in London, Paris, Milan, Rome and Barcelona. Carry a little cash for markets, small cafés, toilets and tips — especially in Germany, Italy, Czechia and Hungary.</li>
        <li><b>Always pay in the local currency.</b> When a card machine or ATM offers to charge you in AUD ('dynamic currency conversion'), decline — the rate is much worse.</li>
        <li>Use bank ATMs; avoid Euronet and other stand-alone cash machines, which charge high fees.</li>
        <li>Currencies: the euro in most countries (Bulgaria since 2026; Montenegro uses it outside the EU). Your route's other currencies: ${routeCurrencies()}.</li>
        ${onRoute("ru") ? "<li><b>Russia:</b> Australian and other Western cards don't work, and you can't withdraw cash with them. Bring all the money you'll need as euro or US dollar cash and exchange it at banks.</li>" : ""}
        <li><b>Tax-free shopping:</b> non-EU residents can reclaim VAT on goods taken home — minimums per shop vary (none in Spain, roughly €50–100 in most countries, CHF 300 in Switzerland). Ask for a tax-free form and validate it at the last EU airport before check-in. The UK stopped tax-free shopping for tourists in 2021.</li>
        <li><b>Tipping</b> isn't compulsory: round up or leave 5–10% for good service. Italian bills include a 'coperto' cover charge; UK restaurants often add 12.5% service.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Tips for travelling in Europe</h3>
      <ul>
        <li><b>Book ahead:</b> headline sights use timed tickets and sell out weeks ahead in summer (Vatican, Colosseum, Last Supper, Sagrada Família, Alhambra, Anne Frank House). Buy on the official site.</li>
        <li><b>Closures:</b> many museums close one day a week — usually Monday (Tuesday for the Louvre and Topkapı). Shops close on Sundays in Germany, Austria and Switzerland.</li>
        <li><b>Mealtimes:</b> Spaniards dine at 21:00–22:00, Italians from 19:30; kitchens often close between lunch and dinner (15:00–19:00).</li>
        <li><b>Pickpockets</b> work crowded metros and sights in Paris, Barcelona, Rome, Prague and Amsterdam. Use a zipped bag worn in front; never put your phone on a café table.</li>
        <li><b>Trains:</b> high-speed tickets are cheapest 1–3 months ahead. In Italy, paper regional tickets must be validated in the green/yellow machines before boarding.</li>
        <li><b>Dress codes:</b> shoulders and knees covered for churches (Vatican, St Mark's, Sagrada Família) and mosques; women need a headscarf in mosques in Istanbul and Sarajevo (usually lent at the door).</li>
        <li><b>Water:</b> tap water is safe throughout this planner's countries — refill bottles at Rome's 'nasoni' fountains. In Istanbul, locals drink bottled.</li>
        <li><b>Toilets</b> in stations often cost €0.50–2; cafés expect you to buy something.</li>
        <li><b>City fees:</b> tourist taxes are added to hotel bills; Venice charges day-trippers an access fee on peak days (€5–10, overnight guests exempt but must register); Rome's Trevi Fountain basin costs €2; Edinburgh adds a 5% visitor levy to accommodation bills (first 5 nights, since 24 July 2026).</li>
        <li><b>Halal:</b> Turkish ('helal'), Lebanese, Moroccan, Pakistani and Bosnian restaurants are the most reliable. Watch for pork in unexpected places — lard in pastries (saindoux, strutto, manteca), ham in salads and quiches, gelatine in sweets and yoghurts, and wine in sauces and risottos.</li>
        <li><b>Emergencies:</b> dial <b>112</b> anywhere in the EU, Switzerland, the UK (999 also works) and Türkiye. In Bosnia & Herzegovina: police 122, ambulance 124.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Pre-departure checklist</h3>
      <p class="hint">Ticks are saved in this browser.</p>
      <ul class="checklist">${checklist.map((c, i) => `<li><input type="checkbox" id="chk-${i}" data-chk="${i}"><label for="chk-${i}"><span>${esc(c)}</span></label></li>`).join("")}</ul>
    </section>`;
  }

  function routeCurrencies() {
    const out = state.stops.map((x) => ctry(x.city)).filter((c, i, a) => a.indexOf(c) === i && !/^€/.test(c.cur)).map((c) => `${c.name} ${c.cur}`);
    return out.length ? esc(out.join("; ")) : "none — it's euros all the way";
  }

  function flightsPanel(ids, first, last) {
    const rows = Object.entries(SYD_FLIGHTS).filter(([id]) => ids.includes(id) || id === first || id === last);
    return `<section class="panel">
      <h3>Flights to and from Sydney</h3>
      <p>Suggested ticket: <b>Sydney → ${esc(CITIES[first].name)}</b>${first === last ? " and back" : `, returning <b>${esc(CITIES[last].name)} → Sydney</b> (book as a multi-city ticket on the airline's site, Google Flights or Skyscanner)`}. Flights leave Sydney in the afternoon or evening and usually land in Europe early the next morning, local time.</p>
      <div class="tbl-wrap"><table><thead><tr><th>City</th><th>Airport</th><th>From Sydney</th></tr></thead><tbody>
        ${rows.map(([id, f]) => `<tr><td><b>${flagOf(id)} ${esc(CITIES[id].name)}</b>${id === first ? " · start" : ""}${id === last ? " · end" : ""}</td><td>${esc(f.airport)}</td><td>${esc(f.text)}</td></tr>`).join("")}
      </tbody></table></div>
      <ul>
        <li>No nonstop flights from Sydney to Europe yet: Qantas plans Sydney–London nonstop from October 2027. Until then the main one-stop options are ${esc(SYD_HUBS)}.</li>
        <li>Emirates, Qatar Airways, Etihad and Turkish Airlines serve halal meals on every flight. On other airlines, request a Muslim meal (MOML) at least 24–48 h before departure.</li>
        <li>Consider a stopover (Dubai, Doha, Abu Dhabi, Singapore, Kuala Lumpur or Istanbul) to break the 22–26 h journey and soften the jet lag.</li>
        <li>Within Europe, fly into the city where your trip starts and out of the one where it ends — an open-jaw ticket usually costs about the same as a return.</li>
      </ul>
    </section>`;
  }

  function ausPanel(ids) {
    return `<section class="panel">
      <h3>For Australians</h3>
      <ul>
        <li><b>Smartraveller:</b> register your trip and subscribe to each country's page at smartraveller.gov.au; check the advice level before you go.</li>
        <li><b>Emergencies abroad:</b> the 24-hour Consular Emergency Centre is <b>+61 2 6261 3305</b> (or 1300 555 135 from within Australia). Australia has embassies in most European capitals; Smartraveller lists the nearest one for each country.</li>
        <li><b>Laws to know:</b> rules differ from Australia's — drones usually need registration, some countries ban face coverings (see Visas & entry), and carrying your passport or ID is required in several countries.</li>
        <li><b>Driving:</b> carry your Australian licence plus an International Driving Permit (from the NRMA or your state motoring club) — required in Italy, Spain, Austria, Greece and others. Europe drives on the right; the UK on the left.</li>
        <li><b>Medicines:</b> bring prescriptions in original packaging with a doctor's letter; some (e.g. strong painkillers, ADHD medication) have limits — check each country's embassy.</li>
        <li><b>Money:</b> low-fee cards (Wise, Revolut, ING, Macquarie, Up) avoid the 3% foreign transaction fee most Australian cards charge. Decline paying in AUD at card machines.</li>
        <li><b>Power:</b> Australian plugs don't fit. Europe uses Type C/F (230 V — fine for Australian devices), the UK Type G.</li>
        <li><b>Time:</b> Central Europe is 8 h behind Sydney in the Australian winter and 10 h behind in summer (UK and Portugal one hour more, Greece and Türkiye one less).</li>
        <li><b>Coming home:</b> declare food, plant and animal products on your arrival declaration (Australia is moving to a digital Australia Travel Declaration in stages). Cheese, cured meats, honey, seeds and some sweets must be declared. Duty-free: A$900 of goods, 2.25 L alcohol, 25 cigarettes.</li>
      </ul>
    </section>`;
  }

  /* ---------- phrases: one phrasebook and halal card per language on the route ---------- */
  const CARD_EN = "I am Muslim and I only eat halal food. Please: no pork, ham, bacon, lard or gelatine, and no alcohol or wine in the food. Is this dish suitable? Thank you!";
  const PHRASES = {
    fr: { name: "French", where: "France, Brussels and Geneva",
      card: "Je suis musulman(e) et je mange uniquement halal. S'il vous plaît : pas de porc, de jambon, de lardons, de saindoux ni de gélatine, et pas d'alcool ni de vin dans le plat. Ce plat me convient-il ? Merci !",
      rows: [["Hello / good day", "Bonjour", "bon-ZHOOR"], ["Thank you", "Merci", "mair-SEE"], ["Please", "S'il vous plaît", "seel voo PLAY"], ["Excuse me / sorry", "Excusez-moi / Pardon", "ex-kew-zay MWAH / par-DOHN"], ["Do you speak English?", "Parlez-vous anglais ?", "par-lay voo ahn-GLAY"], ["How much is it?", "C'est combien ?", "say kohm-BYAN"], ["The bill, please", "L'addition, s'il vous plaît", "lah-dee-SYOHN seel voo play"], ["Where is …?", "Où est … ?", "oo AY"], ["Is it halal?", "C'est halal ?", "say ah-LAHL"], ["I don't eat pork", "Je ne mange pas de porc", "zhuh nuh mahnzh pah duh POR"], ["No alcohol / no wine", "Sans alcool / sans vin", "sahn al-KOL / sahn VAN"], ["Is there gelatine in it?", "Il y a de la gélatine ?", "eel ee ah duh lah zhay-lah-TEEN"], ["Where is the mosque?", "Où est la mosquée ?", "oo ay lah mos-KAY"], ["Help!", "Au secours !", "oh suh-KOOR"]] },
    it: { name: "Italian", where: "Italy and Ticino (Switzerland)",
      card: "Sono musulmano/a e mangio solo cibo halal. Per favore: niente maiale, prosciutto, pancetta, guanciale, strutto o gelatina, e niente alcol o vino nel piatto. Questo piatto va bene per me? Grazie!",
      rows: [["Hello / good morning", "Buongiorno", "bwon-JOR-no"], ["Thank you", "Grazie", "GRAH-tsee-eh"], ["Please", "Per favore", "pair fa-VOR-eh"], ["Excuse me / sorry", "Mi scusi", "mee SKOO-zee"], ["Do you speak English?", "Parla inglese?", "PAR-la een-GLAY-zeh"], ["How much is it?", "Quanto costa?", "KWAN-toh KOS-ta"], ["The bill, please", "Il conto, per favore", "eel KON-toh pair fa-VOR-eh"], ["Where is …?", "Dov'è …?", "doh-VEH"], ["Is it halal?", "È halal?", "eh ah-LAHL"], ["I don't eat pork", "Non mangio carne di maiale", "non MAN-jo KAR-neh dee ma-YAH-leh"], ["No alcohol / no wine", "Senza alcol / senza vino", "SEN-tsa AL-kol / SEN-tsa VEE-no"], ["Is there gelatine in it?", "C'è gelatina?", "cheh jeh-la-TEE-na"], ["Where is the mosque?", "Dov'è la moschea?", "doh-VEH la mos-KAY-a"], ["Help!", "Aiuto!", "eye-OO-toh"]] },
    es: { name: "Spanish", where: "Spain",
      card: "Soy musulmán/musulmana y solo como comida halal. Por favor: sin cerdo, jamón, chorizo, beicon, manteca ni gelatina, y sin alcohol ni vino en la comida. ¿Este plato es adecuado para mí? ¡Gracias!",
      rows: [["Hello", "Hola", "OH-la"], ["Thank you", "Gracias", "GRAH-thyas"], ["Please", "Por favor", "por fa-VOR"], ["Excuse me / sorry", "Perdón / Disculpe", "pair-DON / dees-KOOL-peh"], ["Do you speak English?", "¿Habla inglés?", "AH-bla een-GLES"], ["How much is it?", "¿Cuánto cuesta?", "KWAN-toh KWES-ta"], ["The bill, please", "La cuenta, por favor", "la KWEN-ta por fa-VOR"], ["Where is …?", "¿Dónde está …?", "DON-deh es-TAH"], ["Is it halal?", "¿Es halal?", "es ha-LAL"], ["Does it have pork?", "¿Lleva cerdo?", "YEH-va THER-do"], ["No alcohol / no wine", "Sin alcohol / sin vino", "seen al-KOL / seen BEE-no"], ["Is there gelatine in it?", "¿Lleva gelatina?", "YEH-va heh-la-TEE-na"], ["Where is the mosque?", "¿Dónde está la mezquita?", "DON-deh es-TAH la meth-KEE-ta"], ["Help!", "¡Socorro!", "so-KOR-ro"]] },
    pt: { name: "Portuguese", where: "Portugal",
      card: "Sou muçulmano/a e só como comida halal. Por favor: sem porco, presunto, toucinho, banha ou gelatina, e sem álcool ou vinho na comida. Este prato é adequado para mim? Obrigado/a!",
      rows: [["Hello", "Olá", "oh-LAH"], ["Thank you (man / woman speaking)", "Obrigado / Obrigada", "oh-bree-GAH-doo / -dah"], ["Please", "Por favor", "poor fa-VOR"], ["Excuse me / sorry", "Desculpe", "dish-KOOLP"], ["Do you speak English?", "Fala inglês?", "FAH-la een-GLESH"], ["How much is it?", "Quanto custa?", "KWAN-too KOOSH-ta"], ["The bill, please", "A conta, por favor", "a KON-ta poor fa-VOR"], ["Where is …?", "Onde fica …?", "ON-deh FEE-ka"], ["Is it halal?", "É halal?", "eh ha-LAL"], ["I don't eat pork", "Não como carne de porco", "nown KOH-moo KAR-neh deh POR-koo"], ["No alcohol / no wine", "Sem álcool / sem vinho", "sayn AL-kool / sayn VEE-nyoo"], ["Is there gelatine in it?", "Tem gelatina?", "tayn zheh-la-TEE-na"], ["Where is the mosque?", "Onde fica a mesquita?", "ON-deh FEE-ka a mesh-KEE-ta"], ["Help!", "Socorro!", "soo-KOH-hoo"]] },
    de: { name: "German", where: "Germany, Austria and most of Switzerland",
      card: "Ich bin Muslim/Muslima und esse nur halal. Bitte: kein Schweinefleisch, kein Schinken, Speck, Schmalz oder Gelatine, und kein Alkohol oder Wein im Essen. Ist dieses Gericht für mich geeignet? Danke!",
      rows: [["Hello / good day", "Hallo / Guten Tag", "HAH-lo / GOO-ten tahk"], ["Thank you", "Danke", "DAHN-keh"], ["Please", "Bitte", "BIT-teh"], ["Excuse me / sorry", "Entschuldigung", "ent-SHOOL-di-goong"], ["Do you speak English?", "Sprechen Sie Englisch?", "SHPREH-khen zee ENG-lish"], ["How much is it?", "Wie viel kostet das?", "vee feel KOS-tet dahs"], ["The bill, please", "Die Rechnung, bitte", "dee REKH-noong BIT-teh"], ["Where is …?", "Wo ist …?", "voh ist"], ["Is it halal?", "Ist das halal?", "ist dahs ha-LAHL"], ["I don't eat pork", "Ich esse kein Schweinefleisch", "ikh ES-seh kyne SHVY-neh-flysh"], ["No alcohol / no wine", "Ohne Alkohol / ohne Wein", "OH-neh AL-ko-hol / OH-neh vine"], ["Is there gelatine in it?", "Ist Gelatine drin?", "ist zheh-la-TEE-neh drin"], ["Where is the mosque?", "Wo ist die Moschee?", "voh ist dee mo-SHAY"], ["Help!", "Hilfe!", "HIL-feh"]] },
    nl: { name: "Dutch", where: "the Netherlands and Flanders (almost everyone also speaks English)",
      card: "Ik ben moslim en eet alleen halal. Graag: geen varkensvlees, ham, spek, reuzel of gelatine, en geen alcohol of wijn in het eten. Is dit gerecht geschikt voor mij? Dank u wel!",
      rows: [["Hello", "Hallo / Goedendag", "HAH-lo / KHOO-den-dakh"], ["Thank you", "Dank u wel", "dahnk oo vel"], ["Please", "Alstublieft", "AHL-stoo-bleeft"], ["Excuse me / sorry", "Pardon / Sorry", "par-DON"], ["Do you speak English?", "Spreekt u Engels?", "spraykt oo ENG-els"], ["How much is it?", "Hoeveel kost het?", "hoo-VAYL kost et"], ["The bill, please", "De rekening, alstublieft", "duh RAY-ke-ning"], ["Where is …?", "Waar is …?", "vahr is"], ["Is it halal?", "Is dit halal?", "is dit ha-LAHL"], ["I don't eat pork", "Ik eet geen varkensvlees", "ik ayt khayn VAR-kens-flays"], ["No alcohol", "Zonder alcohol", "ZON-der AL-ko-hol"], ["Is there gelatine in it?", "Zit er gelatine in?", "zit er zheh-la-TEE-neh in"], ["Where is the mosque?", "Waar is de moskee?", "vahr is duh mos-KAY"], ["Help!", "Help!", "help"]] },
    cs: { name: "Czech", where: "Czechia",
      card: "Jsem muslim/muslimka a jím pouze halal jídlo. Prosím: žádné vepřové maso, šunku, slaninu, sádlo ani želatinu, a žádný alkohol ani víno v jídle. Je toto jídlo pro mě vhodné? Děkuji!",
      rows: [["Hello / good day", "Dobrý den", "DOH-bree den"], ["Thank you", "Děkuji", "DYEH-koo-yi"], ["Please", "Prosím", "PROH-seem"], ["Excuse me / sorry", "Promiňte", "PROH-min-teh"], ["Do you speak English?", "Mluvíte anglicky?", "MLOO-vee-teh AHN-glits-kee"], ["How much is it?", "Kolik to stojí?", "KOH-lik toh STOY-ee"], ["The bill, please", "Zaplatím, prosím", "ZA-pla-teem PROH-seem"], ["Where is …?", "Kde je …?", "gdeh yeh"], ["Is it halal?", "Je to halal?", "yeh toh HA-lal"], ["I don't eat pork", "Nejím vepřové", "NEH-yeem VEP-rzho-veh"], ["No alcohol", "Bez alkoholu", "bez AL-ko-ho-loo"], ["Is there gelatine in it?", "Je v tom želatina?", "yeh v tom ZHEH-la-ti-na"], ["Where is the mosque?", "Kde je mešita?", "gdeh yeh MEH-shi-ta"], ["Help!", "Pomoc!", "POH-mots"]] },
    hu: { name: "Hungarian", where: "Hungary",
      card: "Muszlim vagyok, és csak halal ételt eszem. Kérem: ne legyen benne sertéshús, sonka, szalonna, zsír vagy zselatin, se alkohol vagy bor. Megfelelő számomra ez az étel? Köszönöm!",
      rows: [["Hello / good day", "Jó napot", "yoh NAH-pot"], ["Thank you", "Köszönöm", "KUR-sur-nurm"], ["Please", "Kérem", "KAY-rem"], ["Excuse me / sorry", "Elnézést", "EL-nay-zaysht"], ["Do you speak English?", "Beszél angolul?", "BE-sayl AN-go-lool"], ["How much is it?", "Mennyibe kerül?", "MEN-nyee-beh KE-rewl"], ["The bill, please", "A számlát, kérem", "ah SAHM-laht KAY-rem"], ["Where is …?", "Hol van …?", "hol von"], ["Is it halal?", "Ez halal?", "ez HA-lal"], ["I don't eat pork", "Nem eszem sertéshúst", "nem E-sem SHER-taysh-hoosht"], ["No alcohol", "Alkohol nélkül", "AL-ko-hol NAYL-kewl"], ["Is there gelatine in it?", "Van benne zselatin?", "von BEN-neh ZHE-la-tin"], ["Where is the mosque?", "Hol van a mecset?", "hol von ah ME-chet"], ["Help!", "Segítség!", "SHE-geet-shayg"]] },
    el: { name: "Greek", where: "Greece",
      card: "Είμαι μουσουλμάνος/μουσουλμάνα και τρώω μόνο χαλάλ φαγητό. Παρακαλώ: χωρίς χοιρινό, ζαμπόν, μπέικον, λαρδί ή ζελατίνη, και χωρίς αλκοόλ ή κρασί στο φαγητό. Είναι κατάλληλο για μένα αυτό το πιάτο; Ευχαριστώ!",
      rows: [["Hello", "Γεια σας", "YAH sas"], ["Thank you", "Ευχαριστώ", "ef-ha-ree-STOH"], ["Please / you're welcome", "Παρακαλώ", "pa-ra-ka-LOH"], ["Excuse me / sorry", "Συγγνώμη", "seeg-NOH-mee"], ["Do you speak English?", "Μιλάτε αγγλικά;", "mee-LA-te an-glee-KA"], ["How much is it?", "Πόσο κάνει;", "PO-so KA-nee"], ["The bill, please", "Τον λογαριασμό, παρακαλώ", "ton lo-gar-yaz-MO pa-ra-ka-LOH"], ["Where is …?", "Πού είναι …;", "poo EE-ne"], ["Is it halal?", "Είναι χαλάλ;", "EE-ne ha-LAL"], ["I don't eat pork", "Δεν τρώω χοιρινό", "dhen TRO-o hee-ree-NO"], ["Chicken, please", "Κοτόπουλο, παρακαλώ", "ko-TO-poo-lo pa-ra-ka-LOH"], ["No alcohol / no wine", "Χωρίς αλκοόλ / χωρίς κρασί", "ho-REES al-ko-OL / kra-SEE"], ["Where is the mosque?", "Πού είναι το τζαμί;", "poo EE-ne to dza-MEE"], ["Help!", "Βοήθεια!", "vo-EE-thee-a"]] },
    hr: { name: "Croatian / Bosnian", where: "Croatia and Bosnia & Herzegovina",
      card: "Ja sam musliman/muslimanka i jedem samo halal hranu. Molim vas: bez svinjetine, šunke, slanine, masti ili želatine, i bez alkohola ili vina u jelu. Je li ovo jelo prikladno za mene? Hvala!",
      rows: [["Hello / good day", "Dobar dan", "DOH-bar dahn"], ["Peace be upon you (Bosnia)", "Selam alejkum", "se-LAHM a-LAY-koom"], ["Thank you", "Hvala", "HVAH-la"], ["Please", "Molim", "MOH-leem"], ["Excuse me / sorry", "Oprostite", "oh-PROS-ti-teh"], ["Do you speak English?", "Govorite li engleski?", "GO-vo-ri-teh lee EN-gles-kee"], ["How much is it?", "Koliko košta?", "KO-li-ko KOSH-ta"], ["The bill, please", "Račun, molim", "RA-choon MOH-leem"], ["Where is …?", "Gdje je …?", "gdyeh yeh"], ["Is it halal?", "Je li ovo halal?", "yeh lee O-vo HA-lal"], ["I don't eat pork", "Ne jedem svinjetinu", "neh YE-dem SVI-nye-ti-noo"], ["No alcohol", "Bez alkohola", "bez AL-ko-ho-la"], ["Where is the mosque?", "Gdje je džamija?", "gdyeh yeh JA-mi-ya"], ["Help!", "Upomoć!", "OO-po-moch"]] },
    tr: { name: "Turkish", where: "Türkiye (all meat is halal — these are for everything else)",
      card: "Müslümanım ve sadece helal yiyorum. Lütfen yemeğe domuz eti, alkol veya şarap koymayın. Teşekkür ederim!",
      rows: [["Hello", "Merhaba", "MER-ha-ba"], ["Peace be upon you", "Selamün aleyküm", "se-la-MOON a-LAY-koom"], ["Thank you", "Teşekkür ederim", "te-shek-KEWR e-de-rim"], ["Please", "Lütfen", "LEWT-fen"], ["Excuse me / sorry", "Affedersiniz", "af-fe-DER-si-niz"], ["Do you speak English?", "İngilizce biliyor musunuz?", "in-gi-LIZ-je bi-li-YOR mu-su-nuz"], ["How much is it?", "Ne kadar?", "neh ka-DAR"], ["The bill, please", "Hesap, lütfen", "he-SAP LEWT-fen"], ["Where is …?", "… nerede?", "NE-re-de"], ["Where is the mosque?", "Cami nerede?", "JAH-mee NE-re-de"], ["Tea / water", "Çay / su", "chai / soo"], ["Delicious!", "Çok lezzetli!", "chok lez-ZET-lee"], ["Too expensive", "Çok pahalı", "chok pa-ha-LUH"], ["Help!", "Yardım edin!", "yar-DUM e-din"]] },
    pl: { name: "Polish", where: "Poland",
      card: "Jestem muzułmaninem/muzułmanką i jem tylko jedzenie halal. Proszę: bez wieprzowiny, szynki, boczku, smalcu i żelatyny, i bez alkoholu ani wina w jedzeniu. Czy to danie jest dla mnie odpowiednie? Dziękuję!",
      rows: [["Hello / good day", "Dzień dobry", "jen DOB-ri"], ["Thank you", "Dziękuję", "jen-KOO-yeh"], ["Please", "Proszę", "PRO-sheh"], ["Excuse me / sorry", "Przepraszam", "pshe-PRA-sham"], ["Do you speak English?", "Czy mówi Pan/Pani po angielsku?", "chi MOO-vee pan/PA-nee po an-GYEL-skoo"], ["How much is it?", "Ile to kosztuje?", "EE-leh to kosh-TOO-yeh"], ["The bill, please", "Poproszę rachunek", "po-PRO-sheh ra-HOO-nek"], ["Where is …?", "Gdzie jest …?", "gjeh yest"], ["Is it halal?", "Czy to jest halal?", "chi to yest ha-LAL"], ["I don't eat pork", "Nie jem wieprzowiny", "nyeh yem vyep-sho-VEE-ni"], ["No alcohol", "Bez alkoholu", "bez al-ko-HO-loo"], ["Is there gelatine in it?", "Czy jest w tym żelatyna?", "chi yest f tim zhe-la-TI-na"], ["Where is the mosque?", "Gdzie jest meczet?", "gjeh yest MEH-chet"], ["Help!", "Pomocy!", "po-MO-tsi"]] },
    sk: { name: "Slovak", where: "Slovakia",
      card: "Som moslim/moslimka a jem iba halal jedlo. Prosím: žiadne bravčové mäso, šunku, slaninu, masť ani želatínu, a žiadny alkohol ani víno v jedle. Je toto jedlo pre mňa vhodné? Ďakujem!",
      rows: [["Hello / good day", "Dobrý deň", "DOH-bree dyen"], ["Thank you", "Ďakujem", "DYA-koo-yem"], ["Please", "Prosím", "PRO-seem"], ["Excuse me / sorry", "Prepáčte", "PREH-pach-teh"], ["Do you speak English?", "Hovoríte po anglicky?", "HO-vo-ree-teh po AN-glits-kee"], ["How much is it?", "Koľko to stojí?", "KOL-ko to STO-yee"], ["The bill, please", "Zaplatím, prosím", "ZA-pla-teem PRO-seem"], ["Where is …?", "Kde je …?", "gdyeh yeh"], ["Is it halal?", "Je to halal?", "yeh to HA-lal"], ["I don't eat pork", "Nejem bravčové", "NYEH-yem BRAV-cho-veh"], ["No alcohol", "Bez alkoholu", "bez AL-ko-ho-loo"], ["Help!", "Pomoc!", "PO-mots"]] },
    sl: { name: "Slovene", where: "Slovenia",
      card: "Sem musliman/muslimanka in jem samo halal hrano. Prosim: brez svinine, šunke, slanine, masti ali želatine ter brez alkohola ali vina v jedi. Ali je ta jed primerna zame? Hvala!",
      rows: [["Hello / good day", "Dober dan", "DO-ber dahn"], ["Thank you", "Hvala", "HVAH-la"], ["Please", "Prosim", "PRO-seem"], ["Excuse me / sorry", "Oprostite", "o-PROS-ti-teh"], ["Do you speak English?", "Govorite angleško?", "go-vo-REE-teh ang-LESH-ko"], ["How much is it?", "Koliko stane?", "KO-li-ko STAH-neh"], ["The bill, please", "Račun, prosim", "RA-choon PRO-seem"], ["Where is …?", "Kje je …?", "kyeh yeh"], ["Is it halal?", "Ali je to halal?", "A-li yeh to HA-lal"], ["I don't eat pork", "Ne jem svinine", "neh yem svi-NEE-neh"], ["Where is the mosque?", "Kje je džamija?", "kyeh yeh JA-mi-ya"], ["Help!", "Na pomoč!", "na po-MOCH"]] },
    da: { name: "Danish", where: "Denmark (almost everyone also speaks English)",
      card: "Jeg er muslim og spiser kun halal. Venligst: intet svinekød, skinke, bacon, svinefedt eller gelatine, og ingen alkohol eller vin i maden. Er denne ret i orden for mig? Tak!",
      rows: [["Hello", "Hej", "hai"], ["Thank you", "Tak", "tahk"], ["Excuse me / sorry", "Undskyld", "OON-skool"], ["Do you speak English?", "Taler du engelsk?", "TAY-ler doo ENG-elsk"], ["How much is it?", "Hvad koster det?", "va KOS-ter de"], ["Can I have the bill?", "Må jeg få regningen?", "mo yai fo RAI-ning-en"], ["Where is …?", "Hvor er …?", "vor air"], ["Is it halal?", "Er det halal?", "air de ha-LAL"], ["I don't eat pork", "Jeg spiser ikke svinekød", "yai SPEE-ser IG-geh SVEE-neh-kuhth"], ["Is there gelatine in it?", "Er der gelatine i?", "air dair she-la-TEE-neh ee"], ["Where is the mosque?", "Hvor er moskeen?", "vor air mo-SKAY-en"]] },
    sv: { name: "Swedish", where: "Sweden (almost everyone also speaks English)",
      card: "Jag är muslim och äter bara halal. Snälla: inget fläskkött, skinka, bacon, ister eller gelatin, och ingen alkohol eller vin i maten. Passar den här rätten mig? Tack!",
      rows: [["Hello", "Hej", "hey"], ["Thank you", "Tack", "tahk"], ["Excuse me / sorry", "Ursäkta", "oor-SHEK-ta"], ["Do you speak English?", "Pratar du engelska?", "PRAH-tar doo ENG-el-ska"], ["How much is it?", "Vad kostar det?", "vah KOS-tar deh"], ["Can I have the bill?", "Kan jag få notan?", "kan yah foh NOO-tan"], ["Where is …?", "Var ligger …?", "var LIG-er"], ["Is it halal?", "Är det halal?", "air deh ha-LAHL"], ["I don't eat pork", "Jag äter inte fläsk", "yah AIR-ter IN-teh flesk"], ["Is there gelatine in it?", "Finns det gelatin i?", "fins deh she-la-TEEN ee"], ["Where is the mosque?", "Var ligger moskén?", "var LIG-er mos-KAYN"]] },
    no: { name: "Norwegian", where: "Norway (almost everyone also speaks English)",
      card: "Jeg er muslim og spiser bare halal. Vær så snill: ikke svinekjøtt, skinke, bacon, smult eller gelatin, og ikke alkohol eller vin i maten. Passer denne retten for meg? Takk!",
      rows: [["Hello", "Hei", "hai"], ["Thank you", "Takk", "tahk"], ["Excuse me / sorry", "Unnskyld", "OON-shil"], ["Do you speak English?", "Snakker du engelsk?", "SNAK-ker doo ENG-elsk"], ["How much is it?", "Hva koster det?", "vah KOS-ter deh"], ["Can I have the bill?", "Kan jeg få regningen?", "kan yai fo RAI-ning-en"], ["Where is …?", "Hvor er …?", "voor air"], ["Is it halal?", "Er det halal?", "air deh ha-LAHL"], ["I don't eat pork", "Jeg spiser ikke svinekjøtt", "yai SPEE-ser IK-keh SVEE-neh-shut"], ["Where is the mosque?", "Hvor er moskeen?", "voor air mo-SKAY-en"]] },
    fi: { name: "Finnish", where: "Finland (English is widely spoken)",
      card: "Olen muslimi ja syön vain halal-ruokaa. Ei sianlihaa, kinkkua, pekonia, laardia eikä gelatiinia, eikä alkoholia tai viiniä ruokaan, kiitos. Sopiiko tämä ruoka minulle? Kiitos!",
      rows: [["Hello", "Hei / Moi", "hay / moy"], ["Thank you", "Kiitos", "KEE-tos"], ["Excuse me / sorry", "Anteeksi", "AHN-tek-si"], ["Do you speak English?", "Puhutko englantia?", "POO-hut-ko ENG-lan-ti-a"], ["How much is it?", "Paljonko se maksaa?", "PAL-yon-ko seh MAK-saa"], ["Can I have the bill?", "Saisinko laskun?", "SAI-sin-ko LAS-kun"], ["Where is …?", "Missä on …?", "MIS-sa on"], ["Is it halal?", "Onko tämä halal?", "ON-ko TA-ma HA-lal"], ["I don't eat pork", "En syö sianlihaa", "en SU-er SEE-an-li-haa"], ["Is there gelatine in it?", "Onko tässä gelatiinia?", "ON-ko TAS-sa GE-la-tee-ni-a"], ["Where is the mosque?", "Missä on moskeija?", "MIS-sa on MOS-kay-ya"], ["Help!", "Apua!", "A-poo-a"]] },
    is: { name: "Icelandic", where: "Iceland (everyone speaks English — these are a courtesy)",
      card: "Ég er múslimi og borða aðeins halal mat. Vinsamlegast: ekkert svínakjöt, skinku, beikon, svínafeiti eða gelatín, og ekkert áfengi eða vín í matnum. Hentar þessi réttur mér? Takk fyrir!",
      rows: [["Hello / good day", "Halló / Góðan daginn", "HAL-loh / GOH-than DAI-in"], ["Thank you", "Takk fyrir", "tahk FIR-ir"], ["Excuse me / sorry", "Afsakið", "AF-sa-kith"], ["How much is it?", "Hvað kostar þetta?", "kvath KOS-tar THET-ta"], ["Is it halal?", "Er þetta halal?", "air THET-ta HA-lal"], ["I don't eat pork", "Ég borða ekki svínakjöt", "yeh BOR-tha EH-ki SVEE-na-kyurt"]] },
    et: { name: "Estonian", where: "Estonia",
      card: "Ma olen moslem ja söön ainult halal-toitu. Palun ärge pange toitu sealiha, sinki, peekonit, seapekki, želatiini, alkoholi ega veini. Kas see roog sobib mulle? Aitäh!",
      rows: [["Hello", "Tere", "TEH-reh"], ["Thank you", "Aitäh", "AI-tah"], ["Please", "Palun", "PA-lun"], ["Excuse me / sorry", "Vabandust", "VA-ban-dust"], ["Do you speak English?", "Kas te räägite inglise keelt?", "kas teh RAA-gi-teh ING-li-seh keelt"], ["How much is it?", "Kui palju see maksab?", "kui PAL-yu seh MAK-sab"], ["The bill, please", "Arve, palun", "AR-veh PA-lun"], ["Where is …?", "Kus on …?", "kus on"], ["Is it halal?", "Kas see on halal?", "kas seh on HA-lal"], ["I don't eat pork", "Ma ei söö sealiha", "ma ay sur SEH-a-li-ha"], ["Where is the mosque?", "Kus on mošee?", "kus on mo-SHAY"]] },
    lv: { name: "Latvian", where: "Latvia",
      card: "Es esmu musulmanis/musulmaniete un ēdu tikai halal ēdienu. Lūdzu, nelieciet ēdienā cūkgaļu, šķiņķi, speķi, taukus, želatīnu, alkoholu vai vīnu. Vai šis ēdiens man der? Paldies!",
      rows: [["Hello / good day", "Labdien", "LAB-dyen"], ["Thank you", "Paldies", "PAL-dyes"], ["Please", "Lūdzu", "LOOD-zu"], ["Excuse me / sorry", "Atvainojiet", "AT-vai-no-yet"], ["Do you speak English?", "Vai jūs runājat angliski?", "vai yoos RU-na-yat AN-gli-ski"], ["How much is it?", "Cik tas maksā?", "tsik tas MAK-sa"], ["The bill, please", "Rēķinu, lūdzu", "RAY-tyi-nu LOOD-zu"], ["Where is …?", "Kur ir …?", "kur ir"], ["Is it halal?", "Vai tas ir halal?", "vai tas ir HA-lal"], ["I don't eat pork", "Es neēdu cūkgaļu", "es NEH-eh-du TSOOK-ga-lyu"], ["Where is the mosque?", "Kur ir mošeja?", "kur ir mo-SHEH-ya"]] },
    lt: { name: "Lithuanian", where: "Lithuania",
      card: "Esu musulmonas/musulmonė ir valgau tik halal maistą. Prašau nedėti į patiekalą kiaulienos, kumpio, šoninės, taukų, želatinos, alkoholio ar vyno. Ar šis patiekalas man tinka? Ačiū!",
      rows: [["Hello / good day", "Laba diena", "LA-ba dye-NA"], ["Thank you", "Ačiū", "AH-choo"], ["Please", "Prašau", "pra-SHOW"], ["Excuse me / sorry", "Atsiprašau", "at-si-pra-SHOW"], ["Do you speak English?", "Ar kalbate angliškai?", "ar KAL-ba-teh AN-glish-kai"], ["How much is it?", "Kiek kainuoja?", "kyek kai-NWO-ya"], ["The bill, please", "Sąskaitą, prašau", "SAHS-kai-tah pra-SHOW"], ["Where is …?", "Kur yra …?", "kur ee-RA"], ["Is it halal?", "Ar tai halal?", "ar tai HA-lal"], ["I don't eat pork", "Aš nevalgau kiaulienos", "ash ne-VAL-gow kyau-LYEH-nos"], ["Where is the mosque?", "Kur yra mečetė?", "kur ee-RA meh-CHEH-teh"]] },
    ro: { name: "Romanian", where: "Romania",
      card: "Sunt musulman/musulmană și mănânc doar mâncare halal. Vă rog: fără carne de porc, șuncă, bacon, untură sau gelatină și fără alcool sau vin în mâncare. Este acest fel potrivit pentru mine? Mulțumesc!",
      rows: [["Hello / good day", "Bună ziua", "BOO-nuh ZEE-wa"], ["Thank you", "Mulțumesc", "mool-tsoo-MESK"], ["Please", "Vă rog", "vuh rog"], ["Excuse me / sorry", "Scuzați-mă", "skoo-ZAHTS-muh"], ["Do you speak English?", "Vorbiți engleză?", "vor-BEETS en-GLEH-zuh"], ["How much is it?", "Cât costă?", "kuht KOS-tuh"], ["The bill, please", "Nota, vă rog", "NO-ta vuh rog"], ["Where is …?", "Unde este …?", "OON-deh YES-teh"], ["Is it halal?", "Este halal?", "YES-teh ha-LAL"], ["I don't eat pork", "Nu mănânc carne de porc", "noo muh-NUHNK KAR-neh deh pork"], ["No alcohol", "Fără alcool", "FUH-ruh al-KO-ol"], ["Is there gelatine in it?", "Conține gelatină?", "kon-TSEE-neh je-la-TEE-nuh"], ["Where is the mosque?", "Unde este moscheea?", "OON-deh YES-teh mos-KEH-ya"], ["Help!", "Ajutor!", "a-zhoo-TOR"]] },
    bg: { name: "Bulgarian", where: "Bulgaria (careful: a nod means 'no' and a head-shake means 'yes')",
      card: "Аз съм мюсюлманин/мюсюлманка и ям само халал храна. Моля, без свинско месо, шунка, бекон, свинска мас или желатин и без алкохол или вино в храната. Подходящо ли е това ястие за мен? Благодаря!",
      rows: [["Hello", "Здравейте", "zdra-VAY-teh"], ["Thank you", "Благодаря", "bla-go-da-RYA"], ["Please", "Моля", "MO-lya"], ["Excuse me / sorry", "Извинете", "iz-vi-NEH-teh"], ["Do you speak English?", "Говорите ли английски?", "go-VO-ri-teh li an-GLEE-ski"], ["How much is it?", "Колко струва?", "KOL-ko STROO-va"], ["The bill, please", "Сметката, моля", "SMET-ka-ta MO-lya"], ["Where is …?", "Къде е …?", "kuh-DEH eh"], ["Is it halal?", "Халал ли е?", "ha-LAL li eh"], ["I don't eat pork", "Не ям свинско", "neh yam SVIN-sko"], ["No alcohol", "Без алкохол", "bez al-ko-HOL"], ["Where is the mosque?", "Къде е джамията?", "kuh-DEH eh dja-MEE-ya-ta"], ["Help!", "Помощ!", "PO-mosht"]] },
    sr: { name: "Serbian / Montenegrin", where: "Serbia and Montenegro (Latin and Cyrillic scripts are both used)",
      card: "Ja sam musliman/muslimanka i jedem samo halal hranu. Molim vas: bez svinjetine, šunke, slanine, masti ili želatina, i bez alkohola ili vina u jelu. Da li je ovo jelo odgovarajuće za mene? Hvala!",
      rows: [["Hello / good day", "Dobar dan", "DO-bar dan"], ["Thank you", "Hvala", "HVA-la"], ["Please", "Molim", "MO-lim"], ["Excuse me / sorry", "Izvinite", "IZ-vi-ni-teh"], ["Do you speak English?", "Govorite li engleski?", "GO-vo-ri-teh li EN-gles-ki"], ["How much is it?", "Koliko košta?", "KO-li-ko KOSH-ta"], ["The bill, please", "Račun, molim", "RA-choon MO-lim"], ["Where is …?", "Gde je …?", "gdeh yeh"], ["Is it halal?", "Da li je ovo halal?", "da li yeh O-vo HA-lal"], ["I don't eat pork", "Ne jedem svinjetinu", "neh YE-dem SVI-nye-ti-noo"], ["No alcohol", "Bez alkohola", "bez AL-ko-ho-la"], ["Where is the mosque?", "Gde je džamija?", "gdeh yeh JA-mi-ya"], ["Help!", "Upomoć!", "OO-po-moch"]] },
    sq: { name: "Albanian", where: "Albania, Kosovo and western North Macedonia",
      card: "Jam mysliman/myslimane dhe ha vetëm ushqim hallall. Ju lutem: pa mish derri, proshutë, sallo apo xhelatinë, dhe pa alkool apo verë në ushqim. A është i përshtatshëm ky ushqim për mua? Faleminderit!",
      rows: [["Hello", "Tungjatjeta / Përshëndetje", "tun-jat-YEH-ta / pur-shun-DET-yeh"], ["Peace be upon you", "Selam alejkum", "se-LAHM a-LAY-koom"], ["Thank you", "Faleminderit", "fa-leh-min-DEH-rit"], ["Please", "Ju lutem", "yoo LOO-tem"], ["Excuse me / sorry", "Më falni", "muh FAL-ni"], ["Do you speak English?", "Flisni anglisht?", "FLEES-ni ang-LEESHT"], ["How much is it?", "Sa kushton?", "sa koosh-TON"], ["The bill, please", "Faturën, ju lutem", "fa-TOO-run yoo LOO-tem"], ["Where is …?", "Ku është …?", "koo UHSH-tuh"], ["Is it halal?", "A është hallall?", "a UHSH-tuh ha-LALL"], ["I don't eat pork", "Nuk ha mish derri", "nook ha meesh DEH-ree"], ["Where is the mosque?", "Ku është xhamia?", "koo UHSH-tuh ja-MEE-a"], ["Help!", "Ndihmë!", "NDEEH-muh"]] },
    mk: { name: "Macedonian", where: "North Macedonia (Albanian is also widely spoken)",
      card: "Јас сум муслиман/муслиманка и јадам само халал храна. Ве молам: без свинско месо, шунка, сланина, маст или желатин, и без алкохол или вино во храната. Дали ова јадење е соодветно за мене? Благодарам!",
      rows: [["Hello / good day", "Добар ден", "DO-bar den"], ["Thank you", "Благодарам", "bla-go-DA-ram"], ["Please", "Ве молам", "veh MO-lam"], ["Excuse me / sorry", "Извинете", "iz-vi-NEH-teh"], ["Do you speak English?", "Зборувате ли англиски?", "ZBO-ru-va-teh li an-GLIS-ki"], ["How much is it?", "Колку чини?", "KOL-ku CHI-ni"], ["The bill, please", "Сметката, ве молам", "SMET-ka-ta veh MO-lam"], ["Where is …?", "Каде е …?", "KA-deh eh"], ["Is it halal?", "Дали е халал?", "DA-li eh ha-LAL"], ["I don't eat pork", "Не јадам свинско", "neh YA-dam SVIN-sko"], ["Where is the mosque?", "Каде е џамијата?", "KA-deh eh JA-mi-ya-ta"], ["Help!", "Помош!", "PO-mosh"]] },
    ru: { name: "Russian", where: "Russia",
      card: "Я мусульманин/мусульманка и ем только халяльную еду. Пожалуйста, без свинины, ветчины, бекона, сала и желатина, и без алкоголя или вина в блюде. Подходит ли мне это блюдо? Спасибо!",
      rows: [["Hello", "Здравствуйте", "ZDRAST-vooy-teh"], ["Peace be upon you", "Ассаляму алейкум", "as-sa-LYA-moo a-LAY-koom"], ["Thank you", "Спасибо", "spa-SEE-ba"], ["Please", "Пожалуйста", "pa-ZHAL-sta"], ["Excuse me / sorry", "Извините", "iz-vi-NEE-teh"], ["Do you speak English?", "Вы говорите по-английски?", "vy ga-va-REE-teh pa-an-GLEE-ski"], ["How much is it?", "Сколько стоит?", "SKOL-ka STO-it"], ["The bill, please", "Счёт, пожалуйста", "shchyot pa-ZHAL-sta"], ["Where is …?", "Где …?", "gdyeh"], ["Is it halal?", "Это халяль?", "EH-ta kha-LYAL"], ["I don't eat pork", "Я не ем свинину", "ya nyeh yem svi-NEE-noo"], ["No alcohol", "Без алкоголя", "byez al-ka-GO-lya"], ["Where is the mosque?", "Где мечеть?", "gdyeh mye-CHET"], ["Help!", "Помогите!", "pa-ma-GEE-teh"]] },
  };

  const langFlags = (l) => { const fl = Object.keys(COUNTRIES).filter((c) => COUNTRIES[c].lang === l && state.stops.some((st) => CITIES[st.city].country === c)).map((c) => COUNTRIES[c].flag); return (fl.length ? fl : Object.keys(COUNTRIES).filter((c) => COUNTRIES[c].lang === l).map((c) => COUNTRIES[c].flag).slice(0, 3)).join(" "); };
  function phrasesHTML(langs) {
    if (!langs.length) return `<section class="panel"><h3>Phrases</h3><p>Your route is English-speaking. Ask “Is this halal?” and “Is there any pork, alcohol or gelatine in it?” — staff are used to the question, especially in London.</p><div class="card-show"><div class="big">${esc(CARD_EN)}</div></div></section>`;
    return `<section class="panel">
      <h3>Halal cards — show these to restaurant staff</h3>
      <p class="hint">Screenshot the card for each country. In English: “${esc(CARD_EN)}”</p>
      ${langs.map((l) => `<div class="card-show"><b class="tag">${langFlags(l)} ${esc(PHRASES[l].name)} · ${esc(PHRASES[l].where)}</b><div class="big" lang="${l}">${esc(PHRASES[l].card)}</div><div class="actions"><button type="button" class="btn small" data-copycard="${l}">Copy ${esc(PHRASES[l].name)} text</button></div></div>`).join("")}
    </section>
    ${langs.map((l) => `<section class="panel"><h3>${langFlags(l)} ${esc(PHRASES[l].name)}</h3><p class="hint">Spoken in ${esc(PHRASES[l].where)}. Capitals in the pronunciation show the stressed syllable.</p><div class="tbl-wrap"><table><thead><tr><th>English</th><th>${esc(PHRASES[l].name)}</th><th>Say it</th></tr></thead><tbody>
      ${PHRASES[l].rows.map(([en, lo, say]) => `<tr><td>${esc(en)}</td><td class="zh" lang="${l}">${esc(lo)}</td><td class="py">${esc(say)}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}`;
  }

  /* ---------- maps: route map (built-in SVG) and interactive street map (Leaflet + OpenStreetMap) ---------- */
  const mp = (ll) => [(ll[1] - MAP_GEO.lon0) * MAP_GEO.cos * MAP_GEO.k, (MAP_GEO.lat1 - ll[0]) * MAP_GEO.k];
  const SYD_LL = [-33.94, 151.18];
  /* ---------- transport modes between cities ---------- */
  const MODE = {
    train: { label: "Train", cls: "leg-train", icon: "🚆" },
    flight: { label: "Flight", cls: "leg-flight", icon: "✈" },
    bus: { label: "Coach / bus", cls: "leg-road", icon: "🚌" },
    car: { label: "Hire car (self-drive)", cls: "leg-road", icon: "🚗" },
    boat: { label: "Ferry / catamaran", cls: "leg-boat", icon: "⛴" },
    unset: { label: "Not chosen yet", cls: "leg-unset", icon: "?" },
  };
  const pairKey = (a, b) => [a, b].sort().join("|");
  const hasCuratedRoute = (a, b) => !!(ROUTES[a + "|" + b] || ROUTES[b + "|" + a]);

  // Is there a sensible rail journey between two cities?
  // rail groups: uk (Great Britain), eu (continental network), es (Spain), pt (Portugal); null = no useful railway
  function trainOK(a, b) {
    const A = CITIES[a], B = CITIES[b];
    if (!A.rail || !B.rail) return false;
    const d = km(A.stay.ll, B.stay.ll);
    if (A.rail === B.rail) return d < 1300;
    if (["ie", "fi", "ro", "ru"].includes(A.rail) || ["ie", "fi", "ro", "ru"].includes(B.rail)) return false;
    const g = [A.rail, B.rail].sort().join("|");
    if (g === "eu|uk") { const ukSide = A.rail === "uk" ? a : b, other = ukSide === a ? b : a; return ukSide === "lon" && ["par", "bru", "ams"].includes(other); } // Eurostar
    if (g === "es|eu") { const es = A.rail === "es" ? a : b; return es === "bcn" && d < 1100; } // TGV via Barcelona
    return false;
  }

  // The planner's recommendation: local knowledge, then the researched route advice, then a time comparison
  function recommendedMode(a, b) {
    const key = pairKey(a, b), opts = modesFor(a, b);
    if (BEST[key] && opts.includes(BEST[key]) && !(BEST[key] === "boat" && boatOffSeason())) return BEST[key];
    if (BEST[key] === "boat" && boatOffSeason() && opts.includes("bus")) return "bus";
    const cur = curatedMode(a, b);
    if (hasCuratedRoute(a, b) && opts.includes(cur)) return cur;
    const d = km(CITIES[a].stay.ll, CITIES[b].stay.ll);
    if (!opts.includes("train")) return opts.includes("flight") && (d > 450 || !opts.includes("bus")) ? "flight" : opts.includes("bus") ? "bus" : opts[0];
    if (!opts.includes("flight")) return "train";
    const t = modeEstimate("train", a, b), f = modeEstimate("flight", a, b);
    return t.ride > 330 && t.door - f.door >= 90 ? "flight" : "train";
  }

  // Coastal catamarans (e.g. Split–Dubrovnik) run mainly June–September
  function boatOffSeason() {
    if (!state.start) return false;
    const m = new Date(state.start + "T00:00:00").getMonth();
    return m < 5 || m > 8;
  }

  // Why the planner recommends this mode
  function recReason(mode, a, b) {
    const key = pairKey(a, b), opts = modesFor(a, b);
    if (key === "dbv|spu" && mode === "boat") return "The catamaran calls at islands like Korčula and Hvar on the way, so the transfer doubles as sightseeing — and it's more relaxing than the winding coast road. Out of season (Oct–May) sailings are few, so take the bus.";
    const t = opts.includes("train") ? modeEstimate("train", a, b) : null, f = opts.includes("flight") ? modeEstimate("flight", a, b) : null;
    switch (mode) {
      case "train":
        if (t && f && t.door > f.door + 60) return `Flying is quicker door to door here (about ${dur(f.door)} vs ${dur(t.door)} by train), but the train runs city centre to city centre with no security queues or bag fees, and the scenery is part of the trip. If time matters most, choose Flight on the city card.`;
        return `Trains run city centre to city centre with no check-in queues or bag fees${f ? ` — about ${dur(t.door)} door to door, vs about ${dur(f.door)} flying once airport time is counted` : ""}. Book 1–3 months ahead for the cheapest fares.`;
      case "flight": return t ? `The train would take about ${dur(t.ride)}; flying saves around ${dur(Math.max(30, t.door - f.door))} door to door. Budget airlines charge for bags — check what your fare includes.` : CITIES[a].island || CITIES[b].island ? "Flying is the quickest way to and from the island; ferries are slower but scenic." : "There's no practical train on this route, so a short flight is quickest.";
      case "bus": return key === "dbv|spu" ? "Outside June–September the catamaran runs rarely (or not at all), so the coastal bus (~4 h 30, several a day) is the reliable choice." : "No useful railway links these cities, so a coach (or a hire car) is the practical option.";
      case "boat": return "The ferry is the most direct option here.";
      default: return "The most practical option on this route.";
    }
  }

  // The mode the curated route advice describes (from its first sentence)
  function curatedMode(a, b) {
    const first = routeText(a, b).toLowerCase().split(/\.\s|;/)[0];
    const at = (re) => { const m = first.search(re); return m < 0 ? Infinity : m; };
    const pos = { flight: at(/\bfl(y|ying|ight)/), train: at(/train|eurostar|frecciarossa|railjet|\bave\b|tgv|\bice\b|sapsan|bergen line/), bus: at(/coach|\bbus\b/), boat: at(/ferry|catamaran/) };
    const best = Object.keys(pos).sort((x, y) => pos[x] - pos[y])[0];
    return pos[best] === Infinity ? "train" : best;
  }
  // Ride time quoted in the curated advice ("about 2 h 20", "about 45 min"), in minutes
  function curatedMinutes(a, b) {
    const k = ROUTES[a + "|" + b] || ROUTES[b + "|" + a];
    if (!k) return null;
    const first = k.split(/\.\s/)[0];
    const m = first.match(/about (\d+)(?:\.(\d))? h(?: (\d+))?|about (\d+) min/);
    if (!m) return null;
    return m[4] ? +m[4] : +m[1] * 60 + (m[2] ? +m[2] * 6 : 0) + (m[3] ? +m[3] : 0);
  }

  // Modes that make sense for this pair of cities
  function modesFor(a, b) {
    const A = CITIES[a], B = CITIES[b], d = km(A.stay.ll, B.stay.ll), key = pairKey(a, b);
    const island = A.island || B.island;
    const ukCross = (A.country === "gb") !== (B.country === "gb");
    const tr = A.country === "tr" || B.country === "tr";
    const ru = (A.country === "ru") !== (B.country === "ru");
    const ieX = (A.country === "ie") !== (B.country === "ie");
    const out = [];
    if (trainOK(a, b)) out.push("train");
    if (d > 280 || island) out.push("flight");
    if (!island && !ru && !ieX && d < 1200 && (!ukCross || d < 600) && (!tr || d < 700)) out.push("bus");
    if (!island && !ru && !ieX && d < 900 && !ukCross && !tr) out.push("car");
    if (BOATS[key]) out.push("boat");
    if (!out.length) out.push("flight");
    return out;
  }

  // The mode chosen on the form for the leg a → b (null = not chosen)
  function chosenMode(a, b) {
    for (let i = 0; i < state.stops.length; i++) {
      const fromId = i > 0 ? state.stops[i - 1].city : state.arrive || null;
      const st = state.stops[i];
      if (st.city === b && fromId === a && st.leg && st.leg.from === a && st.leg.mode) return st.leg.mode;
    }
    const ol = state.outLeg;
    if (ol && ol.from === a && b === (state.depart || "") && ol.mode) return ol.mode;
    return null;
  }
  // Mode used for time estimates: the chosen one, else the recommended one
  const legMode = (a, b) => chosenMode(a, b) || recommendedMode(a, b);

  // Rough door-to-door minutes and cost for each mode
  function modeEstimate(mode, a, b) {
    const d = km(CITIES[a].stay.ll, CITIES[b].stay.ll), road = d * 1.3;
    const r5e = (n) => Math.max(5, Math.round(n / 5) * 5);
    const boat = BOATS[pairKey(a, b)];
    const quoted = hasCuratedRoute(a, b) && curatedMode(a, b) === mode ? curatedMinutes(a, b) : null;
    const apA = AIRPORT_MIN[a] || 45, apB = AIRPORT_MIN[b] || 45;
    switch (mode) {
      case "flight": { const air = quoted || Math.round((d / 750) * 60 + 30); return { door: apA + 90 + air + 30 + apB, ride: air, cost: d < 1500 ? "€50–200 (bags extra on budget airlines)" : "€90–300", lead: apA + 90 }; }
      case "bus": { const ride = quoted || Math.round((road / 70) * 60); return { door: 30 + 15 + ride + 20, ride, cost: "€" + r5e(road * 0.05) + "–" + r5e(road * 0.1), lead: 45 }; }
      case "car": { const ride = Math.round((road / 85) * 60 + 20); return { door: ride + 30, ride, cost: "€" + r5e(60 + road * 0.15) + "–" + r5e(100 + road * 0.25) + " (hire, fuel & tolls)", lead: 30 }; }
      case "boat": { const ride = boat ? boat.min : Math.round((d / 30) * 60); return { door: 30 + 30 + ride + 20, ride, cost: boat ? boat.cost : "varies", lead: 60 }; }
      default: { const ride = quoted || Math.round(((d * 1.2) / (CITIES[a].slowRail || CITIES[b].slowRail ? 60 : 140)) * 60 + 15); return { door: 25 + 20 + ride + 20, ride, cost: "€" + r5e(d * 0.08) + "–" + r5e(d * 0.25) + " (cheapest booked early)", lead: 45 }; }
    }
  }
  const dur = (m) => (m < 90 ? m + " min" : (Math.round(m / 30) / 2).toString().replace(".5", "½") + " h");

  // Advice text for a chosen mode
  function modeText(mode, a, b) {
    if (mode === curatedMode(a, b)) return routeText(a, b);
    const A = CITIES[a], B = CITIES[b], e = modeEstimate(mode, a, b), cross = crossesBorder(a, b) || newCountry(a, b);
    switch (mode) {
      case "flight": return `Flight ${A.airport} → ${B.airport}: about ${dur(e.ride)} in the air, around ${dur(e.door)} door to door, approx. ${e.cost}. Compare on Google Flights or Skyscanner (Ryanair, easyJet, Wizz Air, Vueling, Volotea, Aegean, Pegasus and the national airlines), then book with the airline.`;
      case "bus": return `Coach ${A.name} → ${B.name} (FlixBus, BlaBlaCar Bus, ALSA, RegioJet…): about ${dur(e.ride)}, approx. ${e.cost}. The cheapest option; bring snacks and a power bank.${crossesBorder(a, b) ? " Passports are checked at the border." : ""}`;
      case "car": return `Hire car ${A.name} → ${B.name}: about ${dur(e.ride)} driving, approx. ${e.cost}. Carry your licence plus an International Driving Permit; Europe drives on the right. Watch for ZTL restricted zones in Italian old towns and motorway vignettes (toll stickers) in Switzerland and Austria.${cross ? " Tell the hire company you're crossing a border — there's usually a fee." : ""}`;
      case "boat": return (BOATS[pairKey(a, b)] || {}).text || "Ferry: check schedules locally.";
      default: return `Train ${A.name} → ${B.name}: about ${dur(e.ride)} on board (there may be a change), approx. ${e.cost}. Book on Trainline, Omio or the operator's app (SNCF Connect, Trenitalia/Italo, DB, ÖBB, SBB, Renfe); high-speed seats are reserved — be on the platform 15 min early.`;
    }
  }
  // Everything the plan needs to know about one leg
  // chosen = the mode the traveller picked, or the planner's recommendation when "Recommend…" is ticked (auto)
  function legInfo(a, b) {
    const picked = chosenMode(a, b), rec = recommendedMode(a, b);
    const auto = !picked && !!state.optimise;
    const use = picked || (auto ? rec : null);
    return { chosen: use, auto, mode: use || "unset", assumed: legMode(a, b), rec, reason: auto ? recReason(rec, a, b) : null, text: use ? modeText(use, a, b) : null, options: modesFor(a, b) };
  }

  // Stops in travel order, including arrival/departure airports that aren't stops
  function routeSequence(plan) {
    const ids = state.stops.map((s) => s.city);
    const seq = [];
    if (plan.arriveId !== ids[0]) seq.push({ id: plan.arriveId, air: true });
    state.stops.forEach((s, i) => seq.push({ id: s.city, n: i + 1, nights: s.nights }));
    if (plan.departId !== ids[ids.length - 1]) seq.push({ id: plan.departId, air: true });
    return seq;
  }

  function routeMapSVG(plan) {
    const seq = routeSequence(plan);
    // Zoom the map to the route: a 4:3 window around the stops, at least ~9° of longitude wide
    const raw = seq.map((p) => mp(CITIES[p.id].stay.ll));
    const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]);
    let vw = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs) + 170, 210), vh = Math.max(Math.max.apply(null, ys) - Math.min.apply(null, ys) + 130, 160);
    if (vw / vh > 4 / 3) vh = (vw * 3) / 4; else vw = (vh * 4) / 3;
    if (vw > MAP_GEO.w) { vw = MAP_GEO.w; vh = (vw * 3) / 4; }
    const cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    const vx = Math.max(0, Math.min(MAP_GEO.w - vw, cx - vw / 2)), vy = Math.max(0, Math.min(MAP_GEO.h - vh, cy - vh / 2));
    const W = 1000, Z = W / vw, H = Math.round(vh * Z);
    const T = (q) => [(q[0] - vx) * Z, (q[1] - vy) * Z];
    const toXY = (ll) => T(mp(ll));
    const places = {};
    seq.forEach((p) => {
      const q = places[p.id] || (places[p.id] = { id: p.id, xy: toXY(CITIES[p.id].stay.ll), nums: [], nights: 0, air: false });
      if (p.n) { q.nums.push(p.n); q.nights += p.nights; } else q.air = true;
    });
    const P = Object.keys(places).map((k) => places[k]);
    const legs = [];
    for (let i = 1; i < seq.length; i++) if (seq[i].id !== seq[i - 1].id) legs.push({ a: places[seq[i - 1].id], b: places[seq[i].id], mode: legInfo(seq[i - 1].id, seq[i].id).mode });
    const modes = {};
    legs.forEach((l) => (modes[l.mode] = 1));

    const legSVG = (l, z) => {
      const [x1, y1] = l.a.xy, [x2, y2] = l.b.xy;
      if (l.mode === "flight") {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        return `<path class="leg ${MODE[l.mode].cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}Q${(mx - dy * 0.18).toFixed(1)} ${(my + dx * 0.18).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
      }
      return `<path class="leg ${MODE[l.mode].cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    };

    // Flights to and from Sydney come in from off the map
    let sydSVG = "";
    if (fromSyd()) {
      const S = toXY(SYD_LL);
      const entry = (to) => { for (let t = 0; t <= 1; t += 0.005) { const x = S[0] + (to[0] - S[0]) * t, y = S[1] + (to[1] - S[1]) * t; if (x > 14 && x < W - 14 && y > 14 && y < H - 14) return [x, y]; } return to; };
      const a = places[plan.arriveId], d = places[plan.departId];
      const ea = entry(a.xy);
      sydSVG += `<path class="leg leg-flight leg-intl" d="M${ea[0].toFixed(1)} ${ea[1].toFixed(1)}L${a.xy[0].toFixed(1)} ${a.xy[1].toFixed(1)}"/>`;
      let lbl = a === d ? "✈ to/from Sydney" : "✈ from Sydney";
      sydSVG += `<text class="map-intl" x="${(ea[0] - 6).toFixed(1)}" y="${(ea[1] - 8).toFixed(1)}" text-anchor="end">${lbl}</text>`;
      if (a !== d) {
        const ed = entry(d.xy);
        sydSVG += `<path class="leg leg-flight leg-intl" d="M${d.xy[0].toFixed(1)} ${d.xy[1].toFixed(1)}L${ed[0].toFixed(1)} ${ed[1].toFixed(1)}"/>`;
        sydSVG += `<text class="map-intl" x="${(ed[0] - 6).toFixed(1)}" y="${(ed[1] + 16).toFixed(1)}" text-anchor="end">✈ to Sydney</text>`;
      }
    }

    // Group stops that are too close to label separately; each group gets a zoomed inset
    const near = 46;
    const groups = [];
    P.forEach((p) => {
      const g = groups.find((gr) => gr.some((q) => Math.hypot(q.xy[0] - p.xy[0], q.xy[1] - p.xy[1]) < near));
      if (g) g.push(p); else groups.push([p]);
    });
    // merge groups that now touch
    for (let i = 0; i < groups.length; i++) for (let j = groups.length - 1; j > i; j--)
      if (groups[i].some((p) => groups[j].some((q) => Math.hypot(q.xy[0] - p.xy[0], q.xy[1] - p.xy[1]) < near))) { groups[i] = groups[i].concat(groups[j]); groups.splice(j, 1); }
    const IW = 300, IH = 225;
    const corners = [[W - IW - 10, H - IH - 10], [W - IW - 10, 10], [10, H - IH - 10], [10, 10]];
    const used = [];
    const insets = [];
    groups.filter((g) => g.length > 1).slice(0, 3).forEach((g) => {
      const xs = g.map((p) => p.xy[0]), ys = g.map((p) => p.xy[1]);
      const cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
      // nearest free corner that doesn't cover any stop
      const c = corners.filter((cn) => !used.includes(cn) && !P.some((p) => p.xy[0] > cn[0] - 15 && p.xy[0] < cn[0] + IW + 15 && p.xy[1] > cn[1] - 15 && p.xy[1] < cn[1] + IH + 15))
        .sort((m, n) => Math.hypot(m[0] + IW / 2 - cx, m[1] + IH / 2 - cy) - Math.hypot(n[0] + IW / 2 - cx, n[1] + IH / 2 - cy))[0];
      if (!c) return;
      used.push(c);
      let vw = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * IW / IH) + 46;
      vw = Math.max(vw, 60);
      const vh = vw * IH / IW;
      insets.push({ g, frame: c, view: [cx - vw / 2, cy - vh / 2, vw, vh], z: IW / vw, c: [cx, cy] });
      g.forEach((p) => (p.inInset = true));
    });

    // Labels, placed to avoid each other and the markers
    const label = (p) => `${flagOf(p.id)} ${CITIES[p.id].name}${p.nights ? " · " + p.nights + "N" : ""}${p.air && !p.nums.length ? " ✈" : ""}`;
    const placeLabels = (pts, z, bounds) => {
      const boxes = pts.map((p) => [p.xy[0] - 11 / z, p.xy[1] - 11 / z, 22 / z, 22 / z]);
      const hit = (b) => boxes.some((o) => b[0] < o[0] + o[2] && b[0] + b[2] > o[0] && b[1] < o[1] + o[3] && b[1] + b[3] > o[1]) ||
        b[0] < bounds[0] || b[1] < bounds[1] || b[0] + b[2] > bounds[0] + bounds[2] || b[1] + b[3] > bounds[1] + bounds[3];
      return pts.map((p) => {
        const t = label(p), w = (t.length * 7.4 + 6) / z, h = 16 / z, [x, y] = p.xy, o = 14 / z;
        const cand = [[x + o, y - h / 2, "start", x + o, y + 5 / z], [x - o - w, y - h / 2, "end", x - o, y + 5 / z],
          [x - w / 2, y - o - h, "middle", x, y - o - 3 / z], [x - w / 2, y + o, "middle", x, y + o + 12 / z]];
        const pick = cand.find((cd) => !hit([cd[0], cd[1], w, h])) || cand[0];
        boxes.push([pick[0], pick[1], w, h]);
        return `<text class="map-label" x="${pick[3].toFixed(1)}" y="${pick[4].toFixed(1)}" text-anchor="${pick[2]}" style="font-size:${(13 / z).toFixed(2)}px;stroke-width:${(3.5 / z).toFixed(2)}px">${esc(t)}</text>`;
      }).join("");
    };
    const marker = (p, z) => {
      const r = (p.nums.length > 1 ? 12 : 10) / z, [x, y] = p.xy;
      if (!p.nums.length) return `<circle class="map-air" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(6 / z).toFixed(2)}" style="stroke-width:${(2 / z).toFixed(2)}px"/>`;
      return `<circle class="map-stop" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" style="stroke-width:${(2 / z).toFixed(2)}px"/><text class="map-num" x="${x.toFixed(1)}" y="${(y + 4 / z).toFixed(1)}" style="font-size:${((p.nums.length > 1 ? 9 : 11) / z).toFixed(2)}px">${p.nums.join("·")}</text>`;
    };
    const base = `<g transform="translate(${(-vx * Z).toFixed(1)} ${(-vy * Z).toFixed(1)}) scale(${Z.toFixed(4)})"><path class="map-land" d="${MAP_GEO.land}"/><path class="map-border" d="${MAP_GEO.borders}"/></g>`;
    const inView = (q) => q[0] > 40 && q[0] < W - 40 && q[1] > 20 && q[1] < H - 20;
    const seas = [["Atlantic Ocean", 45.5, -8.6], ["North Sea", 56.0, 3.0], ["Mediterranean Sea", 38.3, 5.2], ["Tyrrhenian Sea", 39.8, 12.2], ["Adriatic", 42.9, 15.3], ["Aegean", 38.6, 25.0], ["Baltic", 55.4, 16.5], ["Black Sea", 43.3, 34.0], ["Norwegian Sea", 65.0, 4.0], ["Bay of Biscay", 45.3, -4.5]]
      .map(([t, la, lo]) => { const q = toXY([la, lo]); return inView(q) ? `<text class="map-sea" x="${q[0].toFixed(0)}" y="${q[1].toFixed(0)}">${t}</text>` : ""; }).join("");
    const china = seq.map((p) => CITIES[p.id].country).filter((v, i, a) => a.indexOf(v) === i)
      .map((c) => { const q = toXY(COUNTRIES[c].ll); return inView(q) ? `<text class="map-country" x="${q[0].toFixed(0)}" y="${q[1].toFixed(0)}">${esc(COUNTRIES[c].name.toUpperCase())}</text>` : ""; }).join("");

    let svg = `<svg class="tripmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of your route through ${esc(P.map((p) => CITIES[p.id].name).join(", "))}">
      <rect class="map-sea-bg" width="${W}" height="${H}"/>${base}${seas}${china}
      <g>${legs.map((l) => legSVG(l, 1)).join("")}</g>${sydSVG}
      ${P.map((p) => marker(p, 1)).join("")}
      ${placeLabels(P.filter((p) => !p.inInset), 1, [0, 0, W, H])}`;
    insets.forEach((ins) => {
      const [fx, fy] = ins.frame, [vx, vy, vw, vh] = ins.view;
      // leader line from the cluster to its inset
      const tx = Math.max(fx, Math.min(fx + IW, ins.c[0])), ty = Math.max(fy, Math.min(fy + IH, ins.c[1]));
      svg += `<path class="map-leader" d="M${ins.c[0].toFixed(1)} ${ins.c[1].toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}"/><circle class="map-zoomring" cx="${ins.c[0].toFixed(1)}" cy="${ins.c[1].toFixed(1)}" r="${Math.max(18, vw / 2).toFixed(1)}"/>
        <rect class="map-inset-frame" x="${fx}" y="${fy}" width="${IW}" height="${IH}" rx="6"/>
        <svg x="${fx}" y="${fy}" width="${IW}" height="${IH}" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}">
          <rect class="map-sea-bg" x="${vx}" y="${vy}" width="${vw}" height="${vh}"/>${base}
          ${legs.map((l) => legSVG(l, ins.z)).join("")}
          ${P.map((p) => marker(p, ins.z)).join("")}
          ${placeLabels(ins.g, ins.z, [vx, vy, vw, vh])}
        </svg>
        <rect class="map-inset-border" x="${fx}" y="${fy}" width="${IW}" height="${IH}" rx="6"/>
        <text class="map-inset-title" x="${fx + 8}" y="${fy + 18}">Zoomed in</text>`;
    });
    svg += `</svg>`;
    const legend = Object.keys(modes).concat(fromSyd() ? ["intl"] : []).map((m) => m === "intl"
      ? `<span><svg width="34" height="10" aria-hidden="true"><path class="leg leg-flight leg-intl" d="M2 5H32"/></svg>Flight to/from Sydney</span>`
      : `<span><svg width="34" height="10" aria-hidden="true"><path class="leg ${MODE[m].cls}" d="M2 5H32"/></svg>${MODE[m].label}</span>`).join("");
    return { svg, legend, legs };
  }

  function googleTripLink(plan) {
    const pts = routeSequence(plan).map((p) => (CITIES[p.id].local || CITIES[p.id].name).replace(/ \(.*\)/, "") + ", " + ctry(p.id).name);
    return "https://www.google.com/maps/dir/" + pts.map(encodeURIComponent).join("/");
  }
  function googleDayLink(day) {
    const hotel = hotelOf(day.cityId).ll;
    const pts = [hotel].concat(day.slots.filter((s) => s.type === "act").map((s) => s.p.ll), day.kind === "depart" ? [] : [hotel]);
    return pts.length > 1 ? "https://www.google.com/maps/dir/" + pts.map((ll) => ll[0] + "," + ll[1]).join("/") : "";
  }

  function mapPaneHTML(plan) {
    const dayBtns = plan.days.map((d, i) => `<button type="button" class="btn small" data-mapday="${i}">Day ${i + 1}</button>`).join("");
    return `<section class="panel">
        <h3>Your route on the map</h3>
        <div class="map-wrap">${plan.map.svg}</div>
        <div class="map-legend">${plan.map.legend}<span><svg width="22" height="22" aria-hidden="true"><circle class="map-stop" cx="11" cy="11" r="9"/><text class="map-num" x="11" y="15" style="font-size:11px">1</text></svg>Stop number</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Leg</th><th>How</th><th>Details</th></tr></thead><tbody>
          ${plan.map.legs.map((l) => `<tr><td><b>${flagOf(l.a.id)} ${esc(CITIES[l.a.id].name)} → ${flagOf(l.b.id)} ${esc(CITIES[l.b.id].name)}</b></td><td>${l.mode === "unset" ? `Not chosen<br><span class="hint">recommended: ${MODE[recommendedMode(l.a.id, l.b.id)].label}</span>` : MODE[l.mode].icon + " " + MODE[l.mode].label + (legInfo(l.a.id, l.b.id).auto ? '<br><span class="badge top">recommended</span>' : "")}</td><td>${l.mode === "unset" ? legOptionsHTML(l.a.id, l.b.id) : esc(modeText(l.mode, l.a.id, l.b.id))}</td></tr>`).join("")}
        </tbody></table></div>
        <p><a href="${googleTripLink(plan)}" target="_blank" rel="noopener">Open the whole route in Google Maps ↗</a></p>
      </section>
      <section class="panel lmap-wrap">
        <h3>Street map — every stop, day by day</h3>
        <p class="hint">Zoom in to see streets. Pick a day to see that day's stops in order (1 = morning). Use two fingers to move the map on a phone. Needs an internet connection.</p>
        <div class="daypick"><button type="button" class="btn small" data-mapday="all" aria-pressed="true">Whole trip</button>${dayBtns}</div>
        <div id="lmap" class="lmap" role="region" aria-label="Interactive map"></div>
        <p class="hint" id="lmapNote">Map data © OpenStreetMap contributors.</p>
      </section>`;
  }

  /* Interactive map: Leaflet from cdnjs, OpenStreetMap tiles. Loaded only when the Map tab opens. */
  let lmap = null, lmapLayer = null, lmapDay = "all";
  const DAY_COLORS = ["#B3302A", "#2B5C8A", "#1D7556", "#8C620E", "#6B3FA0", "#C2562D", "#2E7D8C", "#A0336B"];
  function ensureLeaflet(cb) {
    if (window.L) return cb();
    ensureLeaflet.q = (ensureLeaflet.q || []).concat(cb);
    if (ensureLeaflet.loading) return;
    ensureLeaflet.loading = true;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => { const q = ensureLeaflet.q; ensureLeaflet.q = []; q.forEach((f) => f()); };
    s.onerror = () => { ensureLeaflet.loading = false; const n = $("#lmapNote"); if (n) n.textContent = "The street map couldn't load — it needs an internet connection. The route map above works offline."; };
    document.head.appendChild(s);
  }
  function showStreetMap() {
    if (!$("#lmap") || !lastPlan) return;
    ensureLeaflet(() => {
      const el = $("#lmap");
      if (!el) return;
      if (!lmap || lmap.getContainer() !== el) {
        if (lmap) { try { lmap.remove(); } catch (e) { /* container already gone */ } }
        lmap = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false });
        let errors = 0;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" })
          .on("tileerror", () => { if (++errors === 4) { const n = $("#lmapNote"); if (n) n.textContent = "Map tiles aren't loading (no internet, or this viewer blocks them). The route map above works offline."; } })
          .addTo(lmap);
      }
      drawStreetMap(lmapDay);
      setTimeout(() => lmap && lmap.invalidateSize(), 50);
    });
  }
  function drawStreetMap(which) {
    if (!lmap || !lastPlan) return;
    lmapDay = which;
    document.querySelectorAll("[data-mapday]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapday === String(which))));
    if (lmapLayer) lmapLayer.remove();
    lmapLayer = L.layerGroup().addTo(lmap);
    const pts = [];
    const pin = (ll, color, text, tip, big) => {
      pts.push(ll);
      L.marker(ll, { icon: L.divIcon({ className: "lpin", html: `<span style="background:${color}">${esc(text)}</span>`, iconSize: big ? [26, 26] : [22, 22], iconAnchor: big ? [13, 13] : [11, 11] }) })
        .bindTooltip(tip, { direction: "top", offset: [0, -10] }).addTo(lmapLayer);
    };
    if (which === "all") {
      const seq = routeSequence(lastPlan);
      L.polyline(seq.map((p) => CITIES[p.id].stay.ll), { color: "#B3302A", weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(lmapLayer);
      lastPlan.days.forEach((d, i) => d.slots.forEach((s) => {
        if (s.type !== "act") return;
        L.circleMarker(s.p.ll, { radius: 5, color: "#fff", weight: 1, fillColor: DAY_COLORS[i % DAY_COLORS.length], fillOpacity: 0.95 })
          .bindTooltip(`Day ${i + 1} · ${SLOT[s.part].label}: ${esc(s.p.n)}`).addTo(lmapLayer);
        pts.push(s.p.ll);
      }));
      seq.forEach((p) => pin(CITIES[p.id].stay.ll, "#17202B", p.n ? String(p.n) : "✈", `${p.n ? p.n + ". " : ""}${esc(CITIES[p.id].name)}${p.nights ? " · " + p.nights + " nights" : " (airport)"}`, true));
    } else {
      const d = lastPlan.days[+which], color = DAY_COLORS[+which % DAY_COLORS.length];
      const hotel = hotelOf(d.cityId).ll;
      const acts = d.slots.filter((s) => s.type === "act");
      L.polyline([hotel].concat(acts.map((s) => s.p.ll), d.kind === "depart" ? [] : [hotel]), { color, weight: 4, opacity: 0.8 }).addTo(lmapLayer);
      pin(hotel, "#17202B", "H", hotelOf(d.cityId).chosen ? `Your hotel: ${esc(hotelOf(d.cityId).n)}` : `Hotel area: ${esc(d.city.stay.area)}`, true);
      acts.forEach((s, k) => pin(s.p.ll, color, String(k + 1), `${SLOT[s.part].label}: ${esc(s.p.n)}`));
      if (d.slots.some((s) => s.type === "travel")) {
        const t = d.slots.find((s) => s.type === "travel");
        pts.push(t.from.stay.ll);
        L.polyline([t.from.stay.ll, t.to.stay.ll], { color: "#555", weight: 2, dashArray: "4 6" }).addTo(lmapLayer);
      }
    }
    if (pts.length === 1) lmap.setView(pts[0], 13);
    else lmap.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  }

  /* ---------- print view: overview, 1 page per day, info, checklist, phrases ---------- */
  // First sentence of a text (avoids regex lookbehind, which Safari only supports from iOS 16.4)
  const firstSentence = (t) => { const str = String(t), i = str.search(/\.\s/); return i < 0 ? str : str.slice(0, i + 1); };
  const plain = (h) => String(h).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  function pvSlot(s, day) {
    const when = SLOT[s.part];
    let b = "";
    if (s.type === "act") {
      const p = s.p, eat = s.eat;
      const food = eat ? eat.located.map((h) => `${h.n} (${h.d < 1 ? Math.round(h.d * 1000) + " m" : h.d.toFixed(1) + " km"})`).concat(eat.general.map((h) => h.n)).slice(0, 2) : [];
      b = `<div class="pv-name">${esc(p.n)} <span class="pv-why">${esc(s.why[1])}</span></div>
        <div><b>Getting there:</b> ${plain(s.how.text)}</div>
        <div>${esc(firstSentence(p.d))}</div>
        <div class="pv-meta">${esc(p.h)} · ${esc(p.c)}${p.m ? " · Stop: " + esc(p.m) : ""}</div>
        ${p.tip ? `<div><b>Tip:</b> ${esc(firstSentence(p.tip))}</div>` : ""}
        ${food.length || (eat && eat.far) ? `<div class="pv-halal"><b>${esc(eat.label)}:</b> ${food.length ? esc(food.join("; ")) : ""}${eat.far ? (food.length ? "; " : "") + "or seafood / vegetarian nearby" : ""}</div>` : ""}
        ${s.insta ? `<div class="pv-meta">📸 ${esc(s.insta.n)}${s.insta.when ? " — best " + esc(s.insta.when.toLowerCase()) : ""}</div>` : ""}
        ${day.friday && (s.part === "m" || s.part === "full") ? `<div class="pv-halal"><b>Jumu'ah:</b> ${esc((day.city.mosques[0] || { n: "search “mosque” in Google Maps" }).n)}</div>` : ""}
        ${s.alt ? `<div class="pv-meta">Or instead: ${esc(s.alt.n)}</div>` : ""}`;
    } else if (s.type === "arrive") {
      b = `<div class="pv-name">${s.via ? "Land in " + esc(s.city.name) : "Arrive & check in"}</div>${s.land != null ? `<div><b>${s.flightNo ? esc(s.flightNo) + " lands" : "Lands"} ${hhmm(s.land)}</b>${s.ready != null ? ` · at the hotel about ${hhmm(s.ready)}` : ""}</div>` : ""}${fromSyd() ? `<div>${plain(sydLine(s.flyIn, "in"))}</div>` : ""}<div>${esc(s.text)}</div>`;
    } else if (s.type === "travel") {
      b = `<div class="pv-name">${s.toFlight ? "To your flight" : "Travel"}: ${esc(s.from.name)} → ${esc(s.to.name)}</div>
        ${s.dep != null ? `<div><b>${s.est ? "Est. " : ""}departs ${hhmm(s.dep)} → arrives ${hhmm(s.arr)}</b>${s.leaveBy != null && !s.toFlight ? ` · leave hotel by ${hhmm(s.leaveBy)}` : ""}</div>` : ""}
        ${s.toFlight && s.leaveBy != null ? `<div><b>Leave ${esc(s.from.name)} by ${hhmm(s.leaveBy)}</b></div>` : ""}
        ${s.collect ? `<div>Collect bags from the hotel first.</div>` : ""}
        ${s.leg && s.leg.chosen ? `<div><b>${MODE[s.leg.chosen].label}:</b> ${esc(s.text)}</div>` : `<div><b>Mode not chosen.</b> Options: ${esc(modesFor(s.fromId, s.toId).map((m) => MODE[m].label + " ~" + dur(modeEstimate(m, s.fromId, s.toId).door) + ", " + modeEstimate(m, s.fromId, s.toId).cost).join(" · "))}</div>`}
        ${s.border ? `<div>Border crossing — passport ready.</div>` : s.newCountry ? `<div>New country: ${esc(ctry(s.toId).name)} — carry your passport.</div>` : ""}
        ${s.toFlight ? "" : `<div><b>On arrival:</b> ${esc(firstSentence(s.arrive))} Check in at ${esc(hotelLabel(s.toId))}.</div>`}`;
    } else if (s.type === "depart") {
      b = `<div class="pv-name">Departure</div>${s.off != null ? `<div><b>${s.flightNo ? esc(s.flightNo) + " takes off" : "Take-off"} ${hhmm(s.off)}</b> · at the airport by ${hhmm(s.off - INTL_BUFFER)}${s.leaveBy != null ? ` · leave hotel by ${hhmm(s.leaveBy)}` : ""}</div>` : ""}<div>${esc(s.text)}</div>${fromSyd() ? `<div>${plain(sydLine(s.flyOut, "out"))}</div>` : ""}`;
    } else if (s.type === "rest") {
      b = `<div class="pv-name">Free time & rest</div><div>Rest, pray, or revisit somewhere you liked.</div>`;
    } else if (s.type === "free") {
      b = `<div class="pv-name">Easy evening</div><div>${esc(s.text)}</div>`;
    }
    return `<tr><th><b>${when.label}</b><br>${esc(s.when || when.time)}</th><td>${b}</td></tr>`;
  }

  function buildPrintView(plan, c) {
    let pv = $("#printView");
    if (!pv) { pv = document.createElement("div"); pv.id = "printView"; pv.setAttribute("aria-hidden", "true"); document.body.appendChild(pv); }
    const pages = [];
    const head = (t, sub) => `<div class="pv-head"><span>Europe Trip Planner</span><span>${esc(sub || "")}</span></div><h1>${t}</h1>`;
    const routeTxt = [fromSyd() ? "Sydney" : null, c.arrId !== c.ids[0] ? CITIES[c.arrId].name : null].filter(Boolean).concat(state.stops.map((s) => `${fname(s.city)} (${s.nights}N)`), [c.depId !== c.ids[c.ids.length - 1] ? CITIES[c.depId].name : null, fromSyd() ? "Sydney" : null].filter(Boolean)).join(" → ");

    // 1. Overview: the At a glance table (long trips continue on the next page), then the trip notes on their own page
    const gRows = glanceRows(plan, true), PER = 16;
    const gTable = (rows) => `<table class="pv-tbl pv-glance"><thead><tr><th>Day</th><th>Date</th><th>Weather</th><th>City</th><th>Morning</th><th>Afternoon</th><th>Evening</th><th>Sleep in</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    const chunks = [];
    for (let k = 0; k < gRows.length; k += PER) chunks.push(gRows.slice(k, k + PER));
    // avoid a lonely last page of one or two days
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 4) { const tail = chunks.pop(); chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(tail); }
    chunks.forEach((rows, k) => pages.push(k === 0
      ? `${head(`${state.days}-day trip · at a glance`, c.startD ? fmtDate(c.startD) + " – " + fmtDate(c.endD) : "")}
        <p class="pv-route">${esc(routeTxt)}</p>
        ${gTable(rows)}
        <p class="pv-meta">${esc(refreshLine())}</p>`
      : `${head("At a glance (continued)", c.startD ? fmtDate(c.startD) + " – " + fmtDate(c.endD) : "")}${gTable(rows)}`));
    pages.push(`${head("Trip notes")}
      <ul class="pv-notes">${c.notes.filter((n) => n[1] !== "Example").map(([, t, h]) => `<li><b>${t}:</b> ${plain(h)}</li>`).join("")}</ul>`);

    // 1b. Route map
    pages.push(`${head("Route map")}<div class="pv-map">${plan.map.svg}</div><div class="map-legend">${plan.map.legend}</div>
      <table class="pv-tbl"><thead><tr><th>Leg</th><th>How</th><th>Details</th></tr></thead><tbody>
      ${plan.map.legs.map((l) => `<tr><td><b>${flagOf(l.a.id)} ${esc(CITIES[l.a.id].name)} → ${flagOf(l.b.id)} ${esc(CITIES[l.b.id].name)}</b></td><td>${MODE[l.mode].label}</td><td>${l.mode === "unset" ? esc(modesFor(l.a.id, l.b.id).map((m) => MODE[m].label + " ~" + dur(modeEstimate(m, l.a.id, l.b.id).door)).join(" · ")) : esc(firstSentence(modeText(l.mode, l.a.id, l.b.id)))}</td></tr>`).join("")}
      </tbody></table>`);

    // 2. One page per day
    plan.days.forEach((d, i) => {
      const firstInCity = d.kind === "arrival" || d.kind === "transfer";
      const hotel = d.city.hotels.find((h) => h.tier === BUDGET_PICK[state.budget]) || d.city.hotels[0];
      const mine = hotelOf(d.cityId);
      pages.push(`<div data-cur="${curOf(d.cityId)}">${head(`Day ${i + 1} · ${esc(d.city.name)} ${ctry(d.cityId).flag}`, (d.date ? fmtDate(d.date) + " · " : "") + (KIND[d.kind] || "Sightseeing"))}
        <p class="pv-sub">${esc(dayTitle(d))}</p>
        ${d.date ? `<p class="pv-meta">${(weatherFor(d.cityId, d.date) || {}).icon || "🌤"} ${esc(wxPlain(d))}</p>` : ""}
        ${firstInCity ? `<p class="pv-stay">${mine.chosen ? `<b>Your hotel:</b> ${esc(mine.n)}.` : `<b>Stay:</b> ${esc(d.city.stay.area)} — e.g. ${esc(hotel.n)}.`} <b>Halal near hotel:</b> ${esc(eatNear(d.city, mine.ll, 2).located.map((h) => h.n).join("; ") || d.city.halalTip)} <b>Cafés:</b> ${esc((d.city.cafes || []).slice(0, 3).map((c) => c.n).join("; "))}</p>` : ""}
        <table class="pv-tl"><tbody>${timelineFor(d, i).map((x) => `<tr class="k-${x.k}"><td class="pv-t">${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}</td><td>${x.icon || TL_ICON[x.k] || ""} <b>${esc(x.title)}</b>${x.note ? ` <span class="pv-meta">— ${esc(x.note)}</span>` : ""}</td></tr>`).join("")}</tbody></table>
        <h2>Details & directions</h2>
        <table class="pv-day"><tbody>${d.slots.filter((s) => s.type !== "act" || !isEdited(d, i) || timelineFor(d, i).some((x) => x.pid === s.p.id)).map((s) => pvSlot(s, d)).join("")}</tbody></table>
        ${d.back && d.kind !== "depart" ? `<p class="pv-meta"><b>Back to the hotel:</b> ${plain(d.back.text)}</p>` : ""}</div>`);
    });

    // 3. Key information
    const uniq = c.ids.filter((v, i, a) => a.indexOf(v) === i);
    const T = { lux: "Lux", mid: "Mid", budget: "Budget" };
    pages.push(`${head("Key information")}
      <div class="pv-cols">
        ${uniq.map((id) => { const ct = CITIES[id]; return `<section data-cur="${curOf(id)}"><h2>${esc(ct.name)} ${ctry(id).flag}</h2>
          <p>${hotelOf(id).chosen ? `<b>Your hotel:</b> ${esc(hotelOf(id).n)}` : `<b>Stay:</b> ${esc(ct.stay.area)}`}</p>
          <p><b>Hotel picks:</b> ${ct.hotels.map((h) => `${esc(h.n)} (${PICK_LABEL[h.tier].replace("★ ", "")}, ${esc(priceText(ct, h))})`).join("; ")}</p>
          <p><b>Halal:</b> ${ct.halal.map((h) => esc(h.n)).join("; ")}</p>
          ${ct.mosques.length ? `<p><b>Mosque:</b> ${ct.mosques.map((m) => esc(m.n)).join("; ")}</p>` : ""}
          <p><b>Cafés:</b> ${(ct.cafes || []).map((x) => esc(x.n)).join("; ")}</p>
          <p><b>Photo spots:</b> ${(ct.insta || []).map((x) => `${esc(x.n)} (${esc(x.when)})`).join("; ")}</p>
          <p><b>Getting around:</b> ${esc(firstSentence(ct.getAround))}</p>
          ${(() => { const sg = citySegments(plan).filter((x) => x.cid === id).map(segWeather).filter(Boolean)[0]; return sg ? `<p><b>Weather on your dates:</b> about ${deg(sg.hi)} by day, ${deg(sg.lo)} at night, ${rainWords(sg.rain)}. <b>Pack:</b> ${esc(sg.pack.slice(0, 4).join(", "))}.</p>` : ""; })()}</section>`; }).join("")}
        <section><h2>Visa & entry</h2>
          ${isAU() ? `<p>Australian passport: Schengen visa-free 90 days in any 180 (all Schengen countries combined); fingerprints and photo on first entry (EES). ETIAS not yet required (expected 2027).${c.zones.uk ? " UK: ETA (£20) needed before travel." : ""}${c.zones.tr ? " Türkiye: visa-free since April 2026." : ""}${c.zones.ba ? " Bosnia & Herzegovina: visa-free 90 days." : ""} Passport valid 3+ months after leaving Schengen.</p>`
            : `<p>Check whether your passport needs a Schengen visa (apply to the country with the most nights; €90).${c.zones.uk ? " UK: ETA or visa needed." : ""}${c.zones.tr ? " Türkiye: e-Visa only at evisa.gov.tr if required." : ""}</p>`}</section>
        ${fromSyd() ? `<section><h2>Flights</h2><p><b>Out:</b> Sydney → ${esc(CITIES[c.arrId].name)}: ${esc(SYD_FLIGHTS[c.arrId] ? SYD_FLIGHTS[c.arrId].text : "")}</p><p><b>Home:</b> ${esc(CITIES[c.depId].name)} → Sydney: ${esc(SYD_FLIGHTS[c.depId] ? SYD_FLIGHTS[c.depId].text : "")}</p></section>` : ""}
        <section><h2>Emergencies</h2><p>112 across the EU, Switzerland, the UK (or 999) and Türkiye. Bosnia & Herzegovina: police 122, ambulance 124.${isAU() ? " Australian Consular Emergency Centre (24 h): +61 2 6261 3305." : ""}</p></section>
        <section><h2>Money & internet</h2><p>Contactless cards work almost everywhere; always pay in the local currency, never AUD. Carry a little cash. Use a travel eSIM.</p></section>
        <section><h2>Apps</h2><p>Google Maps, Citymapper, Trainline/Omio and the national rail apps, Uber/Bolt/FreeNow, Muslim Pro, Zabihah, Google Translate (offline packs), a travel eSIM.</p></section>
        <section><h2>Insurance</h2><p>Medical + evacuation cover; check adventure activities are included.${isAU() ? " Reciprocal health care (UK, Netherlands, Belgium, Italy…) covers public treatment only." : ""}</p></section>
        <section><h2>Tips</h2><p>Book headline sights on official sites weeks ahead. Many museums close Mondays (Louvre Tuesdays). Watch for pickpockets. Cover shoulders and knees in churches and mosques. Ask about pork, lard, gelatine and wine.</p></section>
      </div>`);

    // 4. Checklist
    pages.push(`${head("Pre-departure checklist")}<ul class="pv-check">${checklistItems().map((t) => `<li>☐ ${esc(t)}</li>`).join("")}</ul>
      <h2>Bookings</h2><table class="pv-tbl pv-blank"><thead><tr><th>What</th><th>Date</th><th>Reference</th></tr></thead><tbody>${"<tr><td>&nbsp;</td><td></td><td></td></tr>".repeat(8)}</tbody></table>`);

    // 5. Phrases
    const many = c.langs.length > 3;
    const rows = c.langs.reduce((acc, l) => acc.concat([[langFlags(l) + " " + PHRASES[l].name]], PHRASES[l].rows.slice(0, many ? 8 : 14)), []);
    pages.push(`${head("Phrases & halal cards")}
      ${(c.langs.length ? c.langs : []).map((l) => `<div class="pv-card"><b>${langFlags(l)} ${esc(PHRASES[l].name)}:</b> ${esc(PHRASES[l].card)}</div>`).join("")}
      <div class="pv-card"><span class="pv-meta">${esc(CARD_EN)}</span></div>
      ${rows.length ? phraseTables(rows) : ""}`);

    pv.innerHTML = pages.map((p) => `<section class="pv-page">${p}</section>`).join("");
    audifyIn(pv);
    fitPrintPages();
  }

  // Two side-by-side tables, split at a section heading near the middle
  function phraseTables(rows) {
    let cut = Math.ceil(rows.length / 2);
    while (cut < rows.length && rows[cut].length !== 1) cut++;
    const tbl = (rs) => `<table class="pv-tbl pv-phr"><tbody>${rs.map((r) => r.length === 1 ? `<tr><th colspan="3">${esc(r[0])}</th></tr>` : `<tr><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td><td><i>${esc(r[2])}</i></td></tr>`).join("")}</tbody></table>`;
    return `<div class="pv-split">${tbl(rows.slice(0, cut))}${tbl(rows.slice(cut))}</div>`;
  }

  // Shrink each printed page's text until it fits on one A4 page (190 × 277 mm printable area)
  function fitPrintPages() {
    const pv = $("#printView");
    if (!pv) return;
    pv.classList.add("measuring");
    const limit = 272 * 3.7795; // mm → CSS px, with a small safety margin
    pv.querySelectorAll(".pv-page").forEach((pg) => {
      let size = 11;
      pg.style.fontSize = size + "pt";
      while (pg.scrollHeight > limit && size > 5.5) { size -= 0.25; pg.style.fontSize = size + "pt"; }
    });
    pv.classList.remove("measuring");
  }

  // Print, and never fail silently: if no print window opens, explain why and offer alternatives
  function doPrint() {
    fitPrintPages();
    if (window.NO_PRINT) { showPrintHelp("blocked"); return; }
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    if (standalone) { showPrintHelp("standalone"); return; }
    let opened = false;
    const mark = () => { opened = true; };
    window.addEventListener("beforeprint", mark);
    try { window.print(); } catch (e) { /* print unavailable */ }
    setTimeout(() => { window.removeEventListener("beforeprint", mark); if (!opened) showPrintHelp("nodialog"); }, 1500);
  }

  const WEB_URL = "https://faraz-yarkhan.github.io/EuropeItinirary/";
  function showPrintHelp(reason) {
    const msg = {
      blocked: `<b>Printing is switched off inside the Claude preview.</b> Open the planner at <a href="${WEB_URL}">faraz-yarkhan.github.io/EuropeItinirary</a> (or the downloaded HTML file on a computer) and press Print there.`,
      standalone: `<b>iPhone doesn't allow printing from a Home Screen app.</b> Open <a href="${WEB_URL}">faraz-yarkhan.github.io/EuropeItinirary</a> in Safari, then press Print — or tap <b>Show print layout</b> below and use Share → Print.`,
      nodialog: `<b>No print window opened?</b> Some browsers block it, especially inside apps like WhatsApp, Gmail or Outlook.
        <ul><li><b>iPhone / iPad (Safari):</b> tap Share <span aria-hidden="true">⬆</span> → <b>Print</b>. To save a PDF, pinch outwards on the preview, then Share → Save to Files.</li>
        <li><b>Android (Chrome):</b> ⋮ menu → Share → <b>Print</b>.</li>
        <li><b>Inside another app:</b> open the page in Safari or Chrome first (⋯ → Open in browser).</li></ul>
        Tap <b>Show print layout</b> first so the browser prints the compact version.`,
      nopdf: `<b>The PDF couldn't be made</b> — it needs an internet connection the first time (to load the PDF tools). Instead, use <b>Print</b> and choose <b>Save as PDF</b> (computer, Android), or on iPhone tap <b>Show print layout</b>, then Share → Print → pinch outwards on the preview → Share → Save to Files.`,
    }[reason];
    let el = $("#printHelp");
    if (!el) { el = document.createElement("div"); el.id = "printHelp"; el.className = "printhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Printing help"); document.body.appendChild(el); }
    el.innerHTML = `<div class="printhelp-card"><div>${msg}</div>
      <div class="actions"><button type="button" class="btn print-btn" data-pvscreen>Show print layout</button>${window.NO_PRINT || reason === "nopdf" ? "" : '<button type="button" class="btn" data-pdf>📄 Download PDF</button><button type="button" class="btn" data-save>📲 Save to phone</button>'}<button type="button" class="btn" data-closehelp>Close</button></div></div>`;
    el.hidden = false;
    const first = el.querySelector("[data-pvscreen]");
    if (first) first.focus();
  }

  // Show the compact print pages on screen, so the browser's own Print / Share menu prints them
  function showPrintLayout(on) {
    // Measure the screen before the wide A4 pages appear (they would stretch a phone's layout width)
    const w = Math.min(document.documentElement.clientWidth || window.innerWidth, window.screen && window.screen.width ? window.screen.width : Infinity);
    document.body.classList.toggle("pv-screen", on);
    let bar = $("#pvBar");
    if (on && !bar) {
      bar = document.createElement("div"); bar.id = "pvBar"; bar.className = "pvbar";
      bar.innerHTML = `<button type="button" class="btn" data-pvexit>← Back to planner</button><span class="hint">Print layout — use your browser's Print or Share → Print</span><button type="button" class="btn print-btn" data-pvprint>Print</button>`;
      document.body.insertBefore(bar, document.body.firstChild);
    }
    if (bar) bar.hidden = !on;
    const pv = $("#printView");
    // A4 page = 190 mm content + 2 × 10 mm padding
    if (pv) pv.style.zoom = on ? String(Math.min(1, (w - 16) / (210 * 3.7795 + 6)).toFixed(3)) : "";
    window.scrollTo(0, 0);
  }

  /* ---------- getting files onto phones and computers ---------- */
  const UA = navigator.userAgent || "";
  const isIOS = () => /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = () => /Android/i.test(UA);
  const isPhone = () => isIOS() || isAndroid() || !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|; wv\)|GSA\//i.test(UA);
  function fileFrom(blob, name) { try { return new File([blob], name, { type: blob.type }); } catch (e) { return null; } }
  function canShareFile(file) { try { return !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; } }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    if (typeof a.download === "undefined") window.open(url, "_blank"); // very old Safari
    else { document.body.appendChild(a); a.click(); a.parentNode.removeChild(a); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  // Phones: a dialog whose buttons are fresh taps (share sheets need one). Computers: download straight away.
  function offerFile(blob, name, what) {
    const file = fileFrom(blob, name);
    if (!isPhone()) { downloadBlob(blob, name); toast(`${what} downloaded — check your Downloads folder.`); return; }
    const share = canShareFile(file);
    const howto = isIOS()
      ? `<b>iPhone / iPad:</b> tap <b>Save to phone</b>, then <b>Save to Files</b> (choose <i>On My iPhone</i> so it works offline)${/pdf/.test(blob.type) ? ", or <b>Books</b>" : ""}. Open it later from the <b>Files</b> app. ${share ? "" : "If nothing appears, tap <b>Download</b>, then the ⬇ arrow in Safari's address bar."}`
      : `<b>Android:</b> tap <b>Save to phone</b> and choose <b>Files</b>, <b>Drive</b> or another app — or tap <b>Download</b> and it goes to your <b>Downloads</b> folder (open the <b>Files</b> app → Downloads).`;
    let el = $("#fileHelp");
    if (!el) { el = document.createElement("div"); el.id = "fileHelp"; el.className = "printhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Save your file"); document.body.appendChild(el); }
    el.innerHTML = `<div class="printhelp-card"><div><b>${esc(what)} is ready</b> <span class="hint">(${esc(name)}, ${Math.max(1, Math.round(blob.size / 1024))} KB)</span></div>
      <div class="hint">${howto}${inAppBrowser() ? "<br><b>Inside WhatsApp, Instagram or Gmail?</b> Saving often doesn't work there — open this page in Safari or Chrome first (⋯ → Open in browser)." : ""}</div>
      <div class="actions">${share ? '<button type="button" class="btn print-btn" data-fshare>📲 Save to phone</button>' : ""}<button type="button" class="btn${share ? "" : " print-btn"}" data-fdown>⬇ Download</button><button type="button" class="btn" data-fopen>Open</button><button type="button" class="btn" data-fclose>Close</button></div></div>`;
    el.hidden = false;
    el.onclick = (e) => {
      if (e.target.closest("[data-fshare]")) navigator.share({ files: [file], title: name }).then(() => { el.hidden = true; toast("Saved."); }, (err) => { if (!err || err.name !== "AbortError") { downloadBlob(blob, name); toast("Sharing isn't available here, so it was downloaded instead."); } });
      else if (e.target.closest("[data-fdown]")) { downloadBlob(blob, name); toast(isIOS() ? "Downloading — tap ⬇ in Safari's address bar, then the file → Share → Save to Files." : "Downloading to your Downloads folder."); }
      else if (e.target.closest("[data-fopen]")) window.open(URL.createObjectURL(blob), "_blank");
      else if (e.target.closest("[data-fclose]")) el.hidden = true;
    };
  }

  /* PDF: the print layout's A4 pages, rendered in the browser (html2canvas + jsPDF from cdnjs, loaded on first use) */
  function loadScript(src) {
    return new Promise((ok, fail) => {
      if (document.querySelector(`script[data-src="${src}"]`)) { const w = () => (loadScript.done[src] ? ok() : setTimeout(w, 100)); return w(); }
      const sc = document.createElement("script"); sc.src = src; sc.setAttribute("data-src", src);
      sc.onload = () => { loadScript.done[src] = true; ok(); }; sc.onerror = fail; document.head.appendChild(sc);
    });
  }
  loadScript.done = {};
  // SVG (the route map) loses stylesheet colours when rasterised, so copy computed styles onto each shape
  const SVG_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-opacity", "opacity", "font-size", "font-family", "font-weight", "font-style", "letter-spacing", "text-anchor", "paint-order", "display"];
  function inlineSvgStyles(root) {
    root.querySelectorAll("svg, svg *").forEach((n) => {
      const cs = getComputedStyle(n);
      n.setAttribute("style", SVG_PROPS.map((p) => p + ":" + cs.getPropertyValue(p)).join(";") + ";" + (n.getAttribute("style") || ""));
      if (n.classList && (n.classList.contains("map-land") || n.classList.contains("map-border"))) n.setAttribute("vector-effect", "non-scaling-stroke");
    });
  }
  let pdfBusy = false;
  // A copy of the on-screen itinerary (all tabs, light theme) laid out off-screen for capture
  function buildPdfView() {
    const old = $("#pdfView");
    if (old) old.parentNode.removeChild(old);
    const holder = document.createElement("div");
    holder.id = "pdfView";
    const ids = state.stops.map((x) => CITIES[x.city].name).filter((v, i, a) => a.indexOf(v) === i);
    const flags = state.stops.map((x) => flagOf(x.city)).filter((v, i, a) => a.indexOf(v) === i).join(" ");
    holder.innerHTML = `<header class="mast"><div><h1>Europe Trip Planner <span class="loc">${flags}</span></h1><p>${esc(state.days)}-day trip · ${esc(ids.join(", "))} · ${esc(refreshLine())}</p></div></header>`;
    const clone = $("#out").cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll(".tabs, .actions, .ask, .maplinks, .lmap-wrap, [data-tledit], [data-choosehotel], [data-copycard], .map-legend .btn, .tl-edit, .opts-more summary, script").forEach((n) => n.parentNode.removeChild(n));
    clone.querySelectorAll("[role=tabpanel][hidden]").forEach((n) => n.removeAttribute("hidden"));
    clone.querySelectorAll("details").forEach((n) => n.setAttribute("open", ""));
    holder.appendChild(clone);
    document.body.appendChild(holder);
    inlineSvgStyles(holder);
    // The blocks to place on pages, in reading order; headings stay with what follows
    const blocks = [holder.querySelector(".mast")];
    Array.prototype.forEach.call(clone.children, (el) => {
      if (el.getAttribute("role") === "tabpanel" || el.id === "glanceBox") Array.prototype.forEach.call(el.children, (k) => { if (k.id === "glanceBox") blocks.push(k.firstElementChild); else blocks.push(k); });
      else blocks.push(el);
    });
    return { holder, blocks: blocks.filter((b) => b && b.offsetHeight > 0) };
  }

  // Find a row near `y` (canvas pixels) that is plain background, so a long card is split between lines of text
  function quietRow(canvas, y, lookBack) {
    const ctx = canvas.getContext("2d"), w = canvas.width;
    for (let r = Math.floor(y); r > y - lookBack && r > 0; r--) {
      const row = ctx.getImageData(0, r, w, 1).data;
      let busy = 0;
      for (let x = 8; x < w - 8; x += 6) {
        const k = x * 4;
        if (Math.abs(row[k] - row[32]) + Math.abs(row[k + 1] - row[33]) + Math.abs(row[k + 2] - row[34]) > 24) { if (++busy > 2) break; }
      }
      if (busy <= 2) return r;
    }
    return Math.floor(y);
  }

  // PDF laid out like the planner page: every section (tab) and city starts a new page, nothing is cut through a line of text
  async function downloadPDF() {
    if (pdfBusy || !lastPlan) return;
    pdfBusy = true;
    let view = null;
    try {
      toast("Making your PDF… (needs internet the first time)");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      if (!window.html2canvas || !window.jspdf) throw new Error("libs");
      if (editingDay != null) { const d = editingDay; editingDay = null; refreshDay(d); }
      view = buildPdfView();
      const SCALE = 1.35, PAPER = [243, 244, 242], Q = 0.78;
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      const M = 10, PW = 210 - 2 * M, PH = 297 - 2 * M; // printable area in mm
      const pxToMm = PW / view.holder.querySelector(".mast").offsetWidth;
      const paint = () => { pdf.setFillColor(PAPER[0], PAPER[1], PAPER[2]); pdf.rect(0, 0, 210, 297, "F"); };
      paint();
      let y = M, pages = 1;
      const newPage = () => { pdf.addPage(); paint(); y = M; pages++; };
      // 1. Where each section may break: between its parts, never through a line of text
      const host = view.holder.getBoundingClientRect();
      const slices = [];
      view.blocks.forEach((b, bi) => {
        const leaves = [];
        const expand = (el) => {
          if (el.offsetHeight * pxToMm > PH && el.children.length > 1) Array.prototype.forEach.call(el.children, (k) => { if (k.offsetHeight > 0) expand(k); });
          else leaves.push(el);
        };
        expand(b);
        const br = b.getBoundingClientRect();
        leaves.forEach((el, n) => {
          const top = n === 0 ? 0 : el.getBoundingClientRect().top - br.top;
          const next = leaves[n + 1] ? leaves[n + 1].getBoundingClientRect().top - br.top : br.height;
          if (next - top > 0.5) slices.push({ bi, el, top, bottom: next, last: n === leaves.length - 1 });
        });
      });
      const cls = (el, c) => el.classList && el.classList.contains(c);
      const isSection = (el) => el.tagName === "H2" && cls(el, "print-only");
      const isCity = (el) => cls(el, "city-band");
      const keepsWithNext = (el) => isSection(el) || isCity(el) || cls(el, "city-stay") || /^H[1-6]$/.test(el.tagName) || cls(el, "day-num") || cls(el, "day-title") || cls(el, "details-h") || cls(el, "wx") || cls(el, "tl-head") || cls(el, "slot-when");
      // 2. Draw each section once
      const drawn = [];
      for (let bi = 0; bi < view.blocks.length; bi++) {
        toast(`Making your PDF… ${Math.round((bi / view.blocks.length) * 100)}%`);
        drawn.push(await window.html2canvas(view.blocks[bi], { scale: SCALE, backgroundColor: "rgb(" + PAPER.join(",") + ")", useCORS: true, logging: false, windowWidth: 1300 }));
      }
      const hOf = (k) => (slices[k].bottom - slices[k].top) * pxToMm;
      // 3. Place slices: sections and cities start a new page; headings stay with what follows
      let atTop = true, prevSection = false;
      for (let k = 0; k < slices.length; k++) {
        const sl = slices[k], el = sl.el, block = view.blocks[sl.bi], src = drawn[sl.bi];
        const br = block.getBoundingClientRect();
        const xMm = M + (br.left - host.left) * pxToMm, wMm = br.width * pxToMm, hMm = hOf(k);
        if ((isSection(el) || (isCity(el) && !prevSection)) && !atTop) { newPage(); atTop = true; }
        else {
          let need = hMm, j = k + 1;
          if (slices[k + 1] && slices[k + 1].bi === sl.bi && slices[k + 1].last && hOf(k + 1) < 22) need += hOf(k + 1); // keep a short closing line with its card
          if (keepsWithNext(el)) {
            while (j < slices.length && keepsWithNext(slices[j].el) && !isSection(slices[j].el) && !isCity(slices[j].el)) { need += hOf(j); j++; }
            if (j < slices.length) need += hOf(j) <= PH ? hOf(j) : 50;
          }
          if (!atTop && need > M + PH - y) { newPage(); atTop = true; }
        }
        const sy = Math.round(sl.top * SCALE), sh = Math.min(src.height - sy, Math.round((sl.bottom - sl.top) * SCALE));
        if (sh <= 0) continue;
        const piece = document.createElement("canvas");
        piece.width = src.width; piece.height = sh;
        piece.getContext("2d").drawImage(src, 0, sy, src.width, sh, 0, 0, src.width, sh);
        if (hMm <= PH) {
          pdf.addImage(piece.toDataURL("image/jpeg", Q), "JPEG", xMm, y, wMm, hMm, undefined, "FAST");
          y += hMm + (sl.last ? 4 : 0);
        } else {
          // a single part taller than a whole page (rare): split it at a blank line
          let from = 0;
          while (from < piece.height - 2) {
            const roomPx = ((M + PH - y) / pxToMm) * SCALE;
            let cut = from + roomPx >= piece.height ? piece.height : quietRow(piece, from + roomPx, Math.min(260, roomPx * 0.4));
            if (cut <= from + 20) cut = Math.min(piece.height, from + roomPx);
            const part = document.createElement("canvas");
            part.width = piece.width; part.height = cut - from;
            part.getContext("2d").drawImage(piece, 0, from, piece.width, cut - from, 0, 0, piece.width, cut - from);
            const partMm = ((cut - from) / SCALE) * pxToMm;
            pdf.addImage(part.toDataURL("image/jpeg", Q), "JPEG", xMm, y, wMm, partMm, undefined, "FAST");
            y += partMm; from = cut;
            if (from < piece.height - 2) newPage();
          }
          y += sl.last ? 4 : 0;
        }
        atTop = false;
        prevSection = isSection(el);
      }
      const names = state.stops.map((x) => CITIES[x.city].name.replace(/ \(.*\)/, "")).filter((v, k, a) => a.indexOf(v) === k).slice(0, 4).join(", ");
      pdf.setProperties({ title: `Europe trip · ${state.days} days · ${names}`, creator: "Europe Trip Planner" });
      const blob = pdf.output("blob");
      window.__lastPdf = blob; // for testing
      window.__lastPdfPages = pages;
      const t = $(".toast"); if (t) t.hidden = true;
      offerFile(blob, `Europe trip itinerary (${state.days} days).pdf`, `Your PDF (${pages} pages)`);
    } catch (e) {
      showPrintHelp("nopdf");
    } finally {
      if (view && view.holder.parentNode) view.holder.parentNode.removeChild(view.holder);
      pdfBusy = false;
    }
  }

  /* Save the current plan as a script-free HTML file: it opens in any iPhone preview
     (Files, Mail, WhatsApp) and works offline, including where claude.ai is blocked. */
  function saveOffline() {
    if (!lastPlan) return;
    if (window.NO_PRINT) { toast("Saving files is blocked inside this preview. Use the standalone HTML file or the GitHub Pages version to save an offline copy."); return; }
    if (editingDay != null) { const d = editingDay; editingDay = null; refreshDay(d); }
    const out = $("#out").cloneNode(true);
    out.querySelectorAll("[data-tledit]").forEach((n) => n.parentNode.removeChild(n));
    out.querySelectorAll(".tabs, .actions, .ask, script, .maplinks, .lmap-wrap, .map-legend .btn, [data-copycard]").forEach((n) => n.parentNode.removeChild(n));
    out.querySelectorAll("[hidden]").forEach((n) => n.removeAttribute("hidden"));
    out.querySelectorAll("input[type=checkbox]").forEach((n) => { if (n.checked) n.setAttribute("checked", ""); n.setAttribute("disabled", ""); });
    out.removeAttribute("id");
    const pv = $("#printView") ? $("#printView").outerHTML : "";
    const css = Array.prototype.map.call(document.querySelectorAll("style"), (st) => st.textContent).join("\n");
    const ids = state.stops.map((x) => CITIES[x.city].name).filter((v, i, a) => a.indexOf(v) === i);
    const title = `Europe trip · ${state.days} days · ${ids.join(", ")}`;
    const saved = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)}</title>
<style>${css}
.static-wrap { display: block; max-width: 900px; margin: 0 auto; }
.static-wrap .print-only { display: block; font-family: var(--display); font-size: 24px; margin: 24px 0 4px; padding-bottom: 4px; border-bottom: 3px solid var(--seal); }
.static-wrap .out { display: grid; gap: 16px; }
</style></head><body>
<header class="mast"><div><h1>${esc(title)}</h1><p>Saved ${esc(saved)} from the Europe Trip Planner. This copy works offline and in any phone preview.</p></div></header>
<main class="static-wrap"><div class="out">${out.innerHTML}</div></main>
${pv}
</body></html>`;
    const name = `Europe trip itinerary (${state.days} days).html`;
    try {
      offerFile(new Blob([doc], { type: "text/html" }), name, "Your offline copy");
    } catch (e) {
      toast("Couldn't save the file in this browser. Try Copy itinerary as text instead.");
    }
  }

  /* ---------- export & misc ---------- */
  function planText() {
    if (!lastPlan) return "";
    const strip = plain;
    const L = [];
    L.push(`EUROPE TRIP — ${state.days} days`);
    L.push(state.stops.map((s) => `${fname(s.city)} (${s.nights}N)`).join(" → "));
    L.push("");
    lastPlan.days.forEach((d, i) => {
      L.push(`DAY ${i + 1}${d.date ? " — " + fmtDate(d.date) : ""} · ${fname(d.cityId)} · ${dayTitle(d)}`);
      timelineFor(d, i).forEach((x) => L.push(`  ${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}  ${x.title}${x.note ? " — " + x.note : ""}`));
      if (d.date) L.push("  Weather — " + wxPlain(d));
      L.push("  Details:");
      d.slots.forEach((s) => {
        const w = SLOT[s.part].label.toUpperCase();
        if (s.type === "act") {
          L.push(`  ${w} (${s.when || SLOT[s.part].time}): ${s.p.n}${s.p.loc ? " / " + s.p.loc : ""} [${s.why[1]}]`);
          L.push(`    Getting there: ${strip(s.how.text)}`);
          L.push(`    ${s.p.d}`);
          if (s.p.tip) L.push(`    Tip: ${s.p.tip}`);
          if (s.eat && s.eat.located.length) L.push(`    ${s.eat.label}: ${s.eat.located.map((h) => h.n).join("; ")}`);
          if (s.insta) L.push(`    Photo spot: ${s.insta.n}${s.insta.when ? " (best: " + s.insta.when + ")" : ""}`);
        } else if (s.type === "travel") L.push(`  ${w}: Travel ${s.from.name} → ${s.to.name} by ${s.leg && s.leg.chosen ? MODE[s.leg.chosen].label.toLowerCase() : "(mode not chosen — options: " + modesFor(s.fromId, s.toId).map((m) => MODE[m].label.toLowerCase()).join(", ") + ")"}.${s.dep != null ? ` ${s.est ? "Est. " : ""}Departs ${hhmm(s.dep)}, arrives ${hhmm(s.arr)}.` : ""}${s.toFlight && s.leaveBy != null ? ` Leave by ${hhmm(s.leaveBy)}.` : ""} ${s.text}`);
        else if (s.type === "arrive") L.push(`  ARRIVE${s.land != null ? " " + hhmm(s.land) + (s.flightNo ? " (" + s.flightNo + ")" : "") : ""}: ${fromSyd() ? strip(sydLine(s.flyIn, "in")) + " " : ""}${s.text}`);
        else if (s.type === "depart") L.push(`  DEPART${s.off != null ? " " + hhmm(s.off) + (s.flightNo ? " (" + s.flightNo + ")" : "") + (s.leaveBy != null ? ", leave hotel " + hhmm(s.leaveBy) : "") : ""}: ${s.text}${fromSyd() ? " " + strip(sydLine(s.flyOut, "out")) : ""}`);
        else if (s.type === "rest") L.push(`  ${w}: Free time & rest`);
        else if (s.type === "free") L.push(`  ${w}: ${s.text}`);
      });
      if (d.back && d.kind !== "depart") L.push(`  Back to hotel: ${strip(d.back.text)}`);
      L.push("");
    });
    const tail = "\n" + refreshLine() + (state.aud === false ? "" : `\nA$ amounts use €1 = A$${(+state.eurAud).toFixed(2)}.`);
    return (state.aud === false ? L.join("\n") : audText(L.join("\n"), null)) + tail;
  }

  function copy(text, okMsg) {
    const done = () => toast(okMsg);
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : "Couldn't copy automatically — select the text and copy it by hand.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }

  function restoreChecks() {
    const saved = load("checks") || {};
    document.querySelectorAll("[data-chk]").forEach((c) => (c.checked = !!saved[c.dataset.chk]));
  }

  function bindOutput() {
    $("#out").addEventListener("click", (e) => {
      if (clickTimeline(e)) return;
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        if (tab.tagName === "A") e.preventDefault();
        if (tab.dataset.mapdayOpen != null) lmapDay = tab.dataset.mapdayOpen;
        currentTab = tab.dataset.tab; save("tab", currentTab);
        document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === currentTab));
        ["plan", "map", "wx", "stay", "prep", "talk"].forEach((id) => ($("#pane-" + id).hidden = id !== currentTab));
        if (currentTab === "map") showStreetMap();
        if (!tab.closest(".tabs")) $(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const ch = e.target.closest("[data-choosehotel]");
      if (ch) {
        const [cid, tier] = ch.dataset.choosehotel.split("|"), h = CITIES[cid].hotels.find((x) => x.tier === tier);
        state.hotels[cid] = { pick: h.tier, n: h.n, ll: h.ll, area: h.area };
        persist(); renderStops(); generate(false);
        toast(`Itinerary updated: ${CITIES[cid].name} now starts and ends each day at ${h.n}.`);
        return;
      }
      const go = e.target.closest("[data-goto]");
      if (go) { e.preventDefault(); const t = document.getElementById(go.dataset.goto); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const md = e.target.closest("[data-mapday]");
      if (md) { drawStreetMap(md.dataset.mapday); return; }
      if (e.target.id === "copyPlan") copy(planText(), "Itinerary copied — paste it into Notes or a message.");
      const cc = e.target.closest("[data-copycard]");
      if (cc) copy(PHRASES[cc.dataset.copycard].card, "Halal card copied.");
    });
    $("#out").addEventListener("keydown", (e) => {
      const go = e.target.closest && e.target.closest("[data-goto]");
      if (go && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go.click(); }
    });
    $("#out").addEventListener("change", (e) => {
      if (editTimeline(e)) return;
      if (!e.target.dataset.chk) return;
      const saved = load("checks") || {};
      saved[e.target.dataset.chk] = e.target.checked;
      save("checks", saved);
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-print]")) doPrint();
    if (e.target.closest("[data-save]")) saveOffline();
    if (e.target.closest("[data-pdf]")) { if (window.NO_PRINT) toast("Downloads are blocked inside this preview — open the web version to get the PDF."); else downloadPDF(); }
    if (e.target.closest("[data-closehelp]")) { const h = $("#printHelp"); if (h) h.hidden = true; }
    if (e.target.closest("[data-pvscreen]")) { const h = $("#printHelp"); if (h) h.hidden = true; showPrintLayout(true); }
    if (e.target.closest("[data-pvexit]")) showPrintLayout(false);
    if (e.target.closest("[data-pvprint]")) { if (window.NO_PRINT) toast("Printing is blocked in this preview — use your browser's Share → Print, or open the web version."); else try { window.print(); } catch (err) { /* ignore */ } }
  });
  window.addEventListener("beforeprint", fitPrintPages);

  const rf = $("#refreshFooter");
  if (rf) rf.textContent = refreshLine();
  const rn = $("#rateNote");
  if (rn) rn.textContent = `Mid-market rate, checked ${refreshedLabel} and updated daily; other currencies convert via the euro. Type your own rate to override it.`;

  renderForm();
  bindForm();
  bindOutput();
  bindAsk();
  generate(false);
})();
