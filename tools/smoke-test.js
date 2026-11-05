// Quick check that the planner loads and plans trips without errors.
//   node tools/smoke-test.js
// Uses the Playwright + Chromium that cloud sessions have preinstalled.
const { chromium } = require("playwright");
const path = require("path");
const root = path.resolve(__dirname, "..");
// A second trip touching the non-euro, non-Schengen and island parts of the data
const TRIP2 = { countries: ["gb", "cz", "ba", "gr", "no"], arrive: "lon", depart: "ath", stops: ["lon", "osl", "prg", "sjj", "jtr", "ath"].map((c) => ({ city: c, nights: 2, places: [] })),
  pace: "balanced", budget: "mid", passport: "au", home: "syd", optimise: true, types: ["sightseeing", "photo"], other: "" };
(async () => {
  const b = await chromium.launch();
  let failed = false;
  for (const file of ["index.html", "europe-trip-planner.html"]) {
    for (const trip of [null, TRIP2]) {
      const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto("file://" + path.join(root, file));
      if (trip) { await p.evaluate((t) => localStorage.setItem("eu-trip-planner-v1:form", JSON.stringify(t)), trip); await p.reload(); }
      await p.waitForTimeout(1200);
      if (trip) { await p.click("#go"); await p.waitForTimeout(800); }
      const r = await p.evaluate(() => ({
        days: document.querySelectorAll(".day").length,
        timelines: document.querySelectorAll(".tl-item").length,
        aud: (document.querySelector("#out").textContent.match(/≈A\$/g) || []).length,
        hotels: document.querySelectorAll("[data-choosehotel]").length,
        footer: (document.querySelector("#refreshFooter") || {}).textContent || "",
        printPages: document.querySelectorAll("#printView .pv-page").length,
      }));
      const ok = !errs.length && r.days > 0 && r.timelines > 0 && r.aud > 0 && r.hotels > 0 && /Data last refreshed/.test(r.footer) && r.printPages > 0;
      console.log(`${ok ? "PASS" : "FAIL"} ${file}${trip ? " (trip 2)" : ""}: ${r.days} days, ${r.timelines} timeline items, ${r.aud} A$ prices, ${r.hotels} hotel picks, ${r.printPages} print pages | ${r.footer.slice(0, 40)}${errs.length ? " | errors: " + errs.join("; ") : ""}`);
      if (!ok) failed = true;
      await p.close();
    }
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
