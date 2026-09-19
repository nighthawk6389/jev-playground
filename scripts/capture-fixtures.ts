/**
 * Captures REAL data: live Polymarket markets and live Jev judgments.
 *
 * This is the one command that closes the gap left by the development
 * environment, whose egress proxy blocks both APIs. Run it with a key:
 *
 *   TYPESAFE_API_KEY=sk-... npm run capture:fixtures
 *
 * It writes the raw Gamma response as well as the normalized output, so the
 * normalizer stays testable offline against a real payload.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TypeSafeJudge } from "../lib/judge/typesafe";
import { GammaMarketSource } from "../lib/sources/gamma";
import { normalizeEvents, byVolumeDesc } from "../lib/sources/normalize";

const LIMIT = Number(process.env.CAPTURE_LIMIT ?? 24);
const GAMMA = process.env.GAMMA_BASE_URL ?? "https://gamma-api.polymarket.com";

async function main() {
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    console.error(
      "TYPESAFE_API_KEY is not set.\n" +
        "Get a key at https://typesafe.ai, then:\n" +
        "  TYPESAFE_API_KEY=sk-... npm run capture:fixtures",
    );
    process.exit(1);
  }

  const query = "/events?limit=200&closed=false&active=true";
  console.log(`→ fetching ${GAMMA}${query}`);

  const res = await fetch(`${GAMMA}${query}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`Gamma returned ${res.status}. Body:\n${(await res.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const raw = await res.json();

  mkdirSync(join(process.cwd(), "fixtures", "raw"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "fixtures", "raw", "events.json"),
    JSON.stringify(raw, null, 2),
  );
  console.log(`  wrote fixtures/raw/events.json`);

  const { markets, dropped } = normalizeEvents(raw);
  const chosen = byVolumeDesc(markets).slice(0, LIMIT);
  console.log(`  normalized ${markets.length} markets (dropped ${dropped.length}); keeping ${chosen.length}`);
  if (dropped.length) console.log("  drop reasons:", [...new Set(dropped.map((d) => d.reason))]);

  if (chosen.length === 0) {
    console.error("No usable markets. Inspect fixtures/raw/events.json — the Gamma shape may have changed.");
    process.exit(1);
  }

  writeFileSync(
    join(process.cwd(), "fixtures", "markets.json"),
    JSON.stringify(
      { capturedAt: new Date().toISOString(), gammaQuery: query, schemaVersion: 1, markets: chosen },
      null,
      2,
    ),
  );
  console.log(`  wrote fixtures/markets.json`);

  console.log(`→ judging ${chosen.length} markets with Jev…`);
  const started = Date.now();
  const judgments = await new TypeSafeJudge().judgeMarkets(chosen);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const judged = Object.keys(judgments).length;
  console.log(`  judged ${judged}/${chosen.length} in ${elapsed}s`);
  if (judged < chosen.length) {
    console.warn("  some markets came back incomplete — see warnings above.");
  }

  writeFileSync(
    join(process.cwd(), "fixtures", "judgments.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        model: process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest",
        schemaVersion: 1,
        judgments,
      },
      null,
      2,
    ),
  );
  console.log(`  wrote fixtures/judgments.json`);
  console.log("\nDone. `npm run dev` now serves real markets and real Jev judgments.");
}

main().catch((err) => {
  console.error("\nCapture failed:", err);
  process.exit(1);
});
