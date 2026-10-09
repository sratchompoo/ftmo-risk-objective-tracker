const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ftmo-browser-"));
const server = http.createServer((req, res) => {
  const file = path.basename(req.url.split("?")[0] || "index.html");
  if (
    ![
      "index.html",
      "FTMO-Tracker.html",
      "styles.css",
      "app.js",
      "calculations.js",
      "storage.js",
    ].includes(file)
  ) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".js")
        ? "text/javascript"
        : "text/html",
  );
  fs.createReadStream(path.join(__dirname, file)).pipe(res);
});
let browser;
const cleanup = async () => {
  if (browser) await browser.close();
  server.close();
  fs.rmSync(output, { recursive: true, force: true });
};
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/index.html");
  await page
    .getByRole("heading", { name: "FTMO Free Trial Round 1", exact: true })
    .waitFor();
  await page.locator('[data-action="demo"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#app").textContent.includes("$4,300.00"),
  );
  assert.ok((await page.locator("#app").textContent()).includes("$10,300.00"));
  await page.reload();
  assert.ok((await page.locator("#app").textContent()).includes("$4,300.00"));
  await page.screenshot({
    path: path.join(output, "ftmo-desktop.png"),
    fullPage: true,
  });
  for (const route of [
    "daily",
    "trades",
    "planner",
    "weekly",
    "settings",
    "explained",
    "sources",
  ]) {
    await page.goto(base + "/index.html#" + route);
    await page.locator("h1").waitFor();
    assert.ok(await page.locator("#app").textContent());
  }
  await page.goto(base + "/index.html#daily");
  await page.locator('[name="mode"]').selectOption("manual");
  await page.locator('[name="equity"]').fill("100300");
  await page.locator('[name="lowest"]').fill("94999");
  await page.locator('[name="trades"]').fill("1");
  await page.locator('[name="wins"]').fill("0");
  await page.locator('[name="losses"]').fill("1");
  await page.locator('[name="consecutive"]').fill("1");
  await page.locator("#daily-form button.primary").click();
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("บันทึกแล้ว"),
  );
  await page.goto(base + "/index.html#dashboard");
  assert.ok(
    (await page.locator("#app").textContent()).includes("FTMO RULE VIOLATED"),
  );
  await page.goto(base + "/index.html#daily");
  await page.locator("[data-delete-day]").first().click();
  await page.goto(base + "/index.html#dashboard");
  assert.ok(
    (await page.locator("#app").textContent()).includes("FTMO RULE VIOLATED"),
  );
  await page.goto(base + "/index.html#settings");
  await page.locator('[data-action="reset"]').click();
  await page.goto(base + "/index.html#daily");
  await page.locator('[name="lowest"]').fill("100000");
  await page.locator("#daily-form button.primary").click();
  await page.goto(base + "/index.html#planner");
  for (const [name, value] of [
    ["distance", "3"],
    ["tickSize", "0.01"],
    ["tickValue", "1"],
  ])
    await page.locator(`[name="${name}"]`).fill(value);
  assert.ok(
    (await page.locator("#projection").textContent()).includes(
      "WITHIN RISK PLAN",
    ),
  );
  assert.ok(
    (await page.locator("#projection").textContent()).includes("0.830000"),
  );
  await page.locator('[name="grade"]').selectOption("B");
  assert.ok(
    (await page.locator("#projection").textContent()).includes("DO NOT TRADE"),
  );
  await page.goto(base + "/index.html#trades");
  await page.locator('[name="symbol"]').fill("XAUUSD");
  await page.locator('[name="lot"]').fill("0.1");
  await page.locator("#trade-form button.primary").click();
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("บันทึก Trade แล้ว"),
  );
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.locator("[data-edit-trade]").click();
  await page
    .locator('[name="notes"]')
    .fill('<img src=x onerror="window.pwned=true">');
  await page.locator("#trade-form button.primary").click();
  await page.locator("[data-edit-trade]").click();
  assert.equal(
    await page.locator('textarea[name="notes"]').inputValue(),
    '<img src=x onerror="window.pwned=true">',
  );
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  const download = page.waitForEvent("download");
  await page.locator("#backup").click();
  const backup = await download;
  await backup.saveAs(path.join(output, "ftmo-browser-backup.json"));
  await page.goto(base + "/index.html#settings");
  await page.locator('[data-action="reset"]').click();
  await page
    .locator("#import")
    .setInputFiles(path.join(output, "ftmo-browser-backup.json"));
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("Restore สำเร็จ"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tony-ftmo-tracker-v1")).trades.length,
    ),
    1,
  );
  const savedBefore = await page.evaluate(() =>
    localStorage.getItem("tony-ftmo-tracker-v1"),
  );
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await page.waitForFunction(
    () => document.querySelector("#toast").className === "error",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("tony-ftmo-tracker-v1")),
    savedBefore,
  );
  await page.locator('[name="name"]').fill("Tony Test Account");
  await page.locator("#settings-form button.primary").click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tony-ftmo-tracker-v1")).account.name,
    ),
    "Tony Test Account",
  );
  const csvDownload = page.waitForEvent("download");
  await page.locator('[data-action="csv-trades"]').click();
  await (await csvDownload).saveAs(path.join(output, "trades.csv"));
  const csv = fs.readFileSync(path.join(output, "trades.csv"), "utf8");
  assert.ok(csv.includes('"riskPercent"') && csv.includes("XAUUSD"));
  await page.locator("#theme").click();
  assert.equal(await page.locator("body").getAttribute("class"), "light");
  await page.reload();
  assert.equal(await page.locator("body").getAttribute("class"), "light");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(base + "/index.html#dashboard");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: path.join(output, "ftmo-tablet.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  // The portable version must work without any sibling stylesheet or JS file.
  const standalone = await browser.newPage();
  const requests = [];
  standalone.on("pageerror", (e) => errors.push(e.message));
  standalone.on("request", (request) => requests.push(request.url()));
  await standalone.route("**/*.css", (route) => route.abort());
  await standalone.route("**/*.js", (route) => route.abort());
  await standalone.goto(base + "/FTMO-Tracker.html");
  await standalone.locator("h1").waitFor();
  assert.equal(await standalone.locator("#loading-warning").isVisible(), false);
  assert.equal(
    await standalone.evaluate(
      () => getComputedStyle(document.querySelector(".shell")).display,
    ),
    "grid",
  );
  assert.equal(
    requests.filter((url) => /\.(js|css)(\?|$)/.test(url)).length,
    0,
  );
  await standalone.goto(base + "/FTMO-Tracker.html#planner");
  await standalone.locator("#planner-form").waitFor();
  assert.ok(
    (await standalone.locator("#projection").textContent()).includes(
      "DO NOT TRADE",
    ),
  );
  await standalone.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: HTTP local startup, 8 routes, demo, reload persistence, intraday violation, sticky violation after delete, reset, planner, trade create/edit, XSS escaping, JSON backup/restore, theme persistence, tablet/mobile layout; no browser errors.",
  );
  await cleanup();
})().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exitCode = 1;
});
