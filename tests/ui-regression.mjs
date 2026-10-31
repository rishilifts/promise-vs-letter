// Permanent UI regression: submit -> results render, API error -> visible banner.
// Runs the real app locally (next dev) with /api/compare MOCKED at the network
// layer - zero Clocked calls, zero production quota. Bug class guarded: state
// set but never rendered (dropped render lines, 2026-10-31 incident).
// Usage: npm run test:ui   (needs system Chrome at CHROME_PATH or /usr/bin/google-chrome)
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const ART = "tests/artifacts";
fs.mkdirSync(ART, { recursive: true });

const MOCK_RESULT = {
  conflicts: [
    {
      field: "Salary / stipend", fieldKey: "salary",
      promised: "Stipend 25000 per month.",
      stated: "Stipend INR 20000 per month during probation.",
      promiseQuote: "promise quote (local mock)", letterQuote: "letter quote (local mock)",
      score: 0.991, promiseExact: true, letterExact: true,
      promiseGrounded: { supported: 0.98 }, letterGrounded: { supported: 0.97 },
    },
  ],
  notInLetter: [{ field: "Work location", promised: "Fully remote." }],
  newInLetter: [{ field: "Fees / deposit", stated: "Deposit INR 5000." }],
  overflowConflicts: 0,
  creditsUsed: 42,
  maskedEntities: {},
  maskedReport: "Promise vs Letter - conflict report (LOCAL MOCK - no real API call was made).",
};
const MOCK_429 = { error: "Too many checks from this connection - please try again in about an hour." };

let mockMode = "ok"; // "ok" | "429"
function attachMock(page) {
  return page.setRequestInterception(true).then(() => {
    page.on("request", (req) => {
      if (req.url().includes("/api/compare") && req.method() === "POST") {
        if (mockMode === "ok") {
          req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESULT) });
        } else {
          req.respond({ status: 429, contentType: "application/json", body: JSON.stringify(MOCK_429) });
        }
      } else req.continue();
    });
  });
}

function startDev() {
  const p = spawn("npx", ["next", "dev", "-p", String(PORT)], { stdio: "ignore" });
  const deadline = Date.now() + 120000;
  return new Promise((resolve, reject) => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(BASE, { cache: "no-store" });
        const html = await r.text();
        if (r.ok && html.includes("Promise vs Letter")) { clearInterval(t); resolve(p); }
      } catch {}
      if (Date.now() > deadline) { clearInterval(t); reject(new Error("dev server not ready")); }
    }, 1500);
  });
}

const failures = [];
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures.push(name);
}

async function submit(page) {
  await page.type('textarea[placeholder*="recruiter"]', "mock promise: stipend 25000, remote, no fees");
  await page.type('textarea[placeholder*="offer letter"]', "mock letter: stipend 20000, office, deposit 5000");
  await page.click("button.primary");
}

const dev = await startDev();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  // A: desktop submit -> results render
  let page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.setViewport({ width: 1280, height: 900 });
  await attachMock(page);
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await submit(page);
  await page.waitForSelector(".summary", { timeout: 15000 }).catch(() => {});
  const summaryText = await page.$eval(".summary", (el) => el.textContent).catch(() => "");
  const diffRows = await page.$$eval(".diffrow", (els) => els.length).catch(() => 0);
  const errVisibleA = (await page.$(".err")) !== null;
  check("desktop: results summary renders after submit", /1\s*conflicts detected/.test(summaryText.replace(/\s+/g, " ")));
  check("desktop: diff card renders", diffRows === 1);
  check("desktop: one-sided terms block renders", (await page.$$(".list-block")).length >= 1);
  check("desktop: shareable report renders", (await page.$(".report")) !== null);
  check("desktop: no error banner on success", !errVisibleA);
  check("desktop: no page JS errors", pageErrors.length === 0);
  await page.screenshot({ path: `${ART}/desktop-results.png`, fullPage: true });

  // B: API 429 -> visible error banner
  mockMode = "429";
  await page.click("button.primary");
  await page.waitForSelector(".err", { timeout: 15000 }).catch(() => {});
  const errText = await page.$eval(".err", (el) => el.textContent).catch(() => "");
  const resultsCleared = (await page.$(".summary")) === null;
  check("429: error banner visible with provider message", errText.includes("Too many checks from this connection"));
  check("429: stale results cleared while erroring", resultsCleared);
  check("429: no page JS errors", pageErrors.length === 0);
  await page.screenshot({ path: `${ART}/desktop-429-banner.png`, fullPage: true });
  await page.close();

  // C: mobile viewport - results render, reachable by scroll, no horizontal overflow
  mockMode = "ok";
  page = await browser.newPage();
  const mobErrors = [];
  page.on("pageerror", (e) => mobErrors.push(String(e)));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await attachMock(page);
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await submit(page);
  await page.waitForSelector(".summary", { timeout: 15000 }).catch(() => {});
  const mob = await page.evaluate(() => {
    const s = document.querySelector(".summary");
    const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (s) s.scrollIntoView({ block: "start" });
    const rect = s ? s.getBoundingClientRect() : null;
    return { hasSummary: !!s, overflowX, rectTop: rect ? rect.top : null, winH: window.innerHeight };
  });
  check("mobile: results summary exists", mob.hasSummary);
  check("mobile: no horizontal overflow", mob.overflowX <= 1);
  check("mobile: results reachable by scroll into view", mob.rectTop !== null && mob.rectTop >= -1 && mob.rectTop < mob.winH);
  check("mobile: no page JS errors", mobErrors.length === 0);
  await page.screenshot({ path: `${ART}/mobile-results.png`, fullPage: true });
  await page.close();

  // D: file-selected chip layout - long filename stays inside the drop zone
  const longName = "very-long-filename-offer-letter-final-2026-october-revised-v2.pdf";
  fs.writeFileSync(`${ART}/${longName}`, "not a real pdf - layout probe only");
  for (const vp of [{ width: 1280, height: 900, tag: "desktop" }, { width: 390, height: 844, tag: "mobile" }]) {
    page = await browser.newPage();
    await page.setViewport(vp);
    await attachMock(page);
    await page.goto(BASE, { waitUntil: "networkidle0" });
    // open the letter panel PDF tab, then set the file on the hidden input
    const tabs = await page.$$(".panel:nth-of-type(2) .tab, .panel ~ .panel .tab");
    await page.evaluate(() => {
      const panels = document.querySelectorAll(".panel");
      const pdfTab = [...panels[1].querySelectorAll(".tab")].find((b) => b.textContent.trim() === "PDF");
      pdfTab.click();
    });
    await page.waitForSelector(".panel .drop input[type=file]", { timeout: 5000 });
    const inputs = await page.$$(".drop input[type=file]");
    await inputs[inputs.length - 1].uploadFile(`${ART}/${longName}`);
    await page.waitForSelector(".drop .fname", { timeout: 5000 });
    const geom = await page.evaluate(() => {
      const drop = document.querySelector(".drop").getBoundingClientRect();
      const fname = document.querySelector(".drop .fname").getBoundingClientRect();
      return { drop: { l: drop.left, r: drop.right, t: drop.top, b: drop.bottom }, fname: { l: fname.left, r: fname.right, t: fname.top, b: fname.bottom }, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    check(`${vp.tag}: filename inside drop zone`, geom.fname.l >= geom.drop.l - 1 && geom.fname.r <= geom.drop.r + 1 && geom.fname.t >= geom.drop.t - 1 && geom.fname.b <= geom.drop.b + 1);
    check(`${vp.tag}: no horizontal overflow with long filename`, geom.overflowX <= 1);
    await page.screenshot({ path: `${ART}/${vp.tag}-filechip.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
  dev.kill();
}

console.log(failures.length ? `\n${failures.length} FAILURES` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
