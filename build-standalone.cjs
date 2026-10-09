// Keep the editable modules as the source; generate one portable Windows HTML file.
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
let html = read("index.html");
html = html.replace(
  '<link rel="stylesheet" href="styles.css" />',
  () => "<style>\n" + read("styles.css") + "\n</style>",
);
for (const name of ["calculations.js", "storage.js", "app.js"]) {
  const source = read(name).replace(/<\/script/gi, "<\\/script");
  html = html.replace(
    `<script src="${name}"></script>`,
    () => `<script>\n${source}\n</script>`,
  );
}
if (/<script\s+src=|<link\s+rel="stylesheet"/.test(html))
  throw Error("External asset remains in standalone output");
fs.writeFileSync(path.join(__dirname, "FTMO-Tracker.html"), html);
console.log("Built FTMO-Tracker.html: HTML + CSS + JavaScript in one file.");
