// Builds europe-trip-planner.html: index.html with every script inlined, so the planner is one file.
// Run from the repo root: node tools/build-standalone.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => "<script>\n" + fs.readFileSync(path.join(root, f), "utf8").replace(/<\/script/gi, "<\\/script") + "\n</script>");
fs.writeFileSync(path.join(root, "europe-trip-planner.html"), html);
console.log("europe-trip-planner.html", Math.round(html.length / 1024), "KB");
