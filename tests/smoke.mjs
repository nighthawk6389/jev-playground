/**
 * End-to-end smoke test against a real build.
 *
 * Runs against `next build && next start` — never `next dev`, whose first
 * compile of the three/drei barrel looks exactly like a hang.
 *
 * WebGL here is SwiftShader (software). It works, but a heavy fullscreen pass
 * costs ~100ms, so we render small, at dpr 1, with ?fx=0 to skip shadows and
 * postprocessing. Frame timings from this environment mean nothing about real
 * GPU performance.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const PORT = process.env.SMOKE_PORT ?? "3210";
const BASE = `http://localhost:${PORT}`;
const failures = [];
const notes = [];

function check(name, cond, detail = "") {
  if (cond) notes.push(`  ✓ ${name}`);
  else failures.push(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  // Chrome is deprecating the implicit software-GL fallback; be explicit.
  args: ["--enable-unsafe-swiftshader", "--force-device-scale-factor=1", "--hide-scrollbars"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

const consoleErrors = [];
page.on("console", (m) => {
  const t = m.text();
  if (
    m.type() === "error" ||
    /THREE\.WebGLProgram|WebGL: INVALID_|Warning: .*hydrat/i.test(t)
  ) {
    consoleErrors.push(t);
  }
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// Wait for the server.
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    await page.goto(`${BASE}/?fx=0`, { timeout: 3000, waitUntil: "domcontentloaded" });
    up = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!up) {
  console.error("server never came up");
  process.exit(1);
}

await page.waitForSelector("canvas", { timeout: 90_000 });
await page.waitForFunction(() => window.__oddsville?.ready === true, { timeout: 90_000 });
// Give SwiftShader time to compile shaders and draw — KHR_parallel_shader_compile
// is absent here, so compilation is fully blocking.
await new Promise((r) => setTimeout(r, 5000));

const snap = await page.evaluate(() => window.__oddsville);

/* ── The city was built from the data ─────────────────────────────────── */
check("24 buildings rendered", snap.buildings.length === 24, `got ${snap.buildings.length}`);
check("all six districts populated",
  new Set(snap.buildings.map((b) => b.district)).size === 6);
check("fault lines assigned",
  snap.buildings.every((b) => typeof b.faultLine === "string" && b.faultLine.length > 0));

/* ── Data drives geometry, which is the actual product claim ──────────── */
// Derive the expected winner from the fixture rather than hardcoding an id —
// a hardcoded id tests the fixture, not the mapping.
const topVolumeId = JSON.parse(
  readFileSync("fixtures/markets.json", "utf8"),
).markets.reduce((best, m) => (m.volumeUsd > best.volumeUsd ? m : best)).id;
const tallest = [...snap.buildings].sort((a, b) => b.height - a.height)[0];
check("tallest building is the highest-volume market",
  tallest.id === topVolumeId, `tallest ${tallest.id}, expected ${topVolumeId}`);
check("heights vary (not all clamped)",
  new Set(snap.buildings.map((b) => b.height)).size > 10);
check("probabilities span a real range",
  Math.max(...snap.buildings.map((b) => b.yesPrice)) -
    Math.min(...snap.buildings.map((b) => b.yesPrice)) > 0.5);

/* ── The canvas actually drew something ───────────────────────────────── */
const canvasBox = await page.locator("canvas").boundingBox();
check("canvas fills the viewport", canvasBox.width > 1000 && canvasBox.height > 600,
  `${canvasBox?.width}x${canvasBox?.height}`);

const variance = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c.getContext("webgl2");
  const w = 220, h = 160;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels((c.width - w) / 2 | 0, (c.height - h) / 2 | 0, w, h,
    gl.RGBA, gl.UNSIGNED_BYTE, px);
  let min = 255, max = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
    min = Math.min(min, l); max = Math.max(max, l); sum += l;
  }
  return { min, max, mean: sum / (px.length / 4) };
});
// A blank or shader-failed canvas is uniform. This is the check that would
// have caught the drei SoftShadows shader-link failure.
check("canvas is not blank", variance.max - variance.min > 25, JSON.stringify(variance));

/* ── The game loop works end to end ───────────────────────────────────── */
await page.evaluate(() => {
  const s = window.__oddsville;
  // Concentrate deliberately: three markets that share the Fed plate.
  const fed = s.buildings.filter((b) => b.faultLine === "fed_and_rates").slice(0, 3);
  window.__testIds = fed.map((b) => b.id);
});
const fedIds = await page.evaluate(() => window.__testIds);
check("found a concentrated set to test with", fedIds.length >= 2, `got ${fedIds.length}`);

// Buy through the real store, the same path the UI uses.
await page.evaluate((ids) => {
  const st = window.__zustandCity;
  ids.forEach((id) => st.getState().buy(id, 1000));
}, fedIds);

await page.waitForTimeout(500);
const afterBuy = await page.evaluate(() => window.__oddsville);
check("positions registered", afterBuy.positions.length === fedIds.length,
  `got ${afterBuy.positions.length}`);

const integrity = await page.evaluate(() => window.__integrity);
check("CONCENTRATION DROPPED INTEGRITY below 60%", integrity < 0.6,
  `integrity was ${integrity}`);

/* ── The stress test runs and shakes the city ─────────────────────────── */
const stress = await page.evaluate(async () => {
  const res = await fetch("/api/stress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shock: "The Fed cuts rates by 50 basis points" }),
  });
  return { ok: res.ok, body: await res.json() };
});
check("stress route responded", stress.ok, JSON.stringify(stress.body).slice(0, 120));
check("stress judged all 24 markets", stress.body.effects?.length === 24);
check("preset shock is labelled recorded, not simulated",
  stress.body.provenance === "recorded", `got ${stress.body.provenance}`);

const survey = await page.evaluate(async (ids) => {
  const res = await fetch("/api/survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return { ok: res.ok, body: await res.json() };
}, fedIds);
check("survey route responded", survey.ok);
check("survey found shared bedrock among Fed holdings",
  (survey.body.links ?? []).some((l) => l.shared > 0.5),
  JSON.stringify(survey.body.links ?? []).slice(0, 160));

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

/* ── Screenshots, with effects ON so we can judge the look ────────────── */
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__oddsville?.ready === true, { timeout: 90_000 });
await new Promise((r) => setTimeout(r, 14_000));
await page.screenshot({ path: "tests/out/city.png" });

// And a quake, mid-shake.
await page.evaluate(async () => {
  const res = await fetch("/api/stress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shock: "A ceasefire is signed in Ukraine" }),
  });
  window.__zustandCity.getState().setShock(await res.json());
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: "tests/out/quake.png" });

await browser.close();

console.log(notes.join("\n"));
if (failures.length) {
  console.log("\nFAILURES:");
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log(`\nAll ${notes.length} smoke checks passed.`);
