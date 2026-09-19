/**
 * Builds the offline fixture set.
 *
 * IMPORTANT: the judgments written here are SYNTHETIC, not real Jev output —
 * this container cannot reach api.typesafe.ai. They are hand-authored to be
 * plausible so the demo is playable with zero keys, and every fixture file
 * records `synthetic: true` so nobody mistakes them for captured model output.
 * Run `npm run capture:fixtures` with a real key to replace them.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeEvents, byVolumeDesc } from "../lib/sources/normalize";
import { FAULT_LINES, FaultLine, Judgment, Archetype, District } from "../lib/ports";

const root = process.cwd();

interface Seed {
  q: string;
  yes: number;
  vol: number;
  liq: number;
  end: string;
  chg: number;
  district: District;
  archetype: Archetype;
  spectacle: number;
  brittle: number;
  fault: FaultLine;
  /** Secondary plate, so tectonics are graded rather than a hard partition. */
  fault2?: FaultLine;
  event: string;
  tags: string[];
}

const SEEDS: Seed[] = [
  // ── Capitol ──────────────────────────────────────────────────────────────
  { q: "Will Republicans hold the House in the 2026 midterms?", yes: 0.44, vol: 18_400_000, liq: 940_000, end: "2026-11-04", chg: -0.02, district: "capitol", archetype: "courthouse", spectacle: 3.6, brittle: 0.92, fault: "us_elections", event: "midterms-2026", tags: ["Politics", "Elections"] },
  { q: "Will Democrats win control of the Senate in 2026?", yes: 0.51, vol: 14_100_000, liq: 820_000, end: "2026-11-04", chg: 0.03, district: "capitol", archetype: "courthouse", spectacle: 3.5, brittle: 0.9, fault: "us_elections", event: "midterms-2026", tags: ["Politics", "Elections"] },
  { q: "Will a government shutdown begin before October 2026?", yes: 0.27, vol: 4_200_000, liq: 310_000, end: "2026-10-01", chg: 0.05, district: "capitol", archetype: "factory", spectacle: 2.6, brittle: 0.72, fault: "us_elections", fault2: "fed_and_rates", event: "shutdown-2026", tags: ["Politics"] },
  { q: "Will the Supreme Court overturn Chevron deference precedent further in 2026?", yes: 0.33, vol: 1_900_000, liq: 140_000, end: "2026-06-30", chg: -0.01, district: "capitol", archetype: "courthouse", spectacle: 2.1, brittle: 0.95, fault: "us_elections", event: "scotus-2026", tags: ["Politics", "Law"] },

  // ── Exchange ─────────────────────────────────────────────────────────────
  { q: "Will the Fed cut rates at the March 2026 meeting?", yes: 0.62, vol: 22_700_000, liq: 1_500_000, end: "2026-03-18", chg: 0.08, district: "exchange", archetype: "courthouse", spectacle: 3.2, brittle: 0.97, fault: "fed_and_rates", event: "fed-march", tags: ["Economics", "Fed"] },
  { q: "Will Jerome Powell be replaced as Fed Chair before 2027?", yes: 0.21, vol: 6_800_000, liq: 420_000, end: "2026-12-31", chg: -0.04, district: "exchange", archetype: "monument", spectacle: 2.9, brittle: 0.83, fault: "fed_and_rates", fault2: "us_elections", event: "powell", tags: ["Economics", "Fed"] },
  { q: "Will US inflation exceed 4% in any month of 2026?", yes: 0.38, vol: 5_300_000, liq: 360_000, end: "2026-12-31", chg: 0.02, district: "exchange", archetype: "factory", spectacle: 2.4, brittle: 0.18, fault: "fed_and_rates", event: "inflation-2026", tags: ["Economics"] },
  { q: "Will Bitcoin close above $150,000 in 2026?", yes: 0.41, vol: 31_200_000, liq: 2_100_000, end: "2026-12-31", chg: 0.06, district: "exchange", archetype: "tower", spectacle: 3.3, brittle: 0.22, fault: "crypto_regulation", fault2: "fed_and_rates", event: "btc-150k", tags: ["Crypto"] },
  { q: "Will the SEC approve a spot Solana ETF before July 2026?", yes: 0.57, vol: 8_900_000, liq: 610_000, end: "2026-07-01", chg: 0.11, district: "exchange", archetype: "courthouse", spectacle: 2.7, brittle: 0.93, fault: "crypto_regulation", event: "sol-etf", tags: ["Crypto", "Regulation"] },
  { q: "Will a top-5 US bank announce crypto custody services in 2026?", yes: 0.68, vol: 2_400_000, liq: 180_000, end: "2026-12-31", chg: 0.01, district: "exchange", archetype: "factory", spectacle: 1.8, brittle: 0.61, fault: "crypto_regulation", fault2: "corporate_leadership", event: "bank-custody", tags: ["Crypto"] },

  // ── Foundry ──────────────────────────────────────────────────────────────
  { q: "Will OpenAI release GPT-6 before 2027?", yes: 0.49, vol: 12_600_000, liq: 780_000, end: "2026-12-31", chg: -0.03, district: "foundry", archetype: "observatory", spectacle: 3.1, brittle: 0.88, fault: "ai_capability", event: "gpt6", tags: ["Tech", "AI"] },
  { q: "Will an AI system achieve gold on the International Math Olympiad in 2026?", yes: 0.72, vol: 3_700_000, liq: 240_000, end: "2026-07-31", chg: 0.09, district: "foundry", archetype: "observatory", spectacle: 2.5, brittle: 0.94, fault: "ai_capability", event: "imo-gold", tags: ["Tech", "AI"] },
  { q: "Will Sam Altman remain CEO of OpenAI through 2026?", yes: 0.86, vol: 5_100_000, liq: 330_000, end: "2026-12-31", chg: 0.0, district: "foundry", archetype: "monument", spectacle: 2.8, brittle: 0.79, fault: "corporate_leadership", fault2: "ai_capability", event: "altman", tags: ["Tech", "AI"] },
  { q: "Will SpaceX launch Starship to orbit with a payload in 2026?", yes: 0.77, vol: 4_500_000, liq: 290_000, end: "2026-12-31", chg: 0.04, district: "foundry", archetype: "tower", spectacle: 2.9, brittle: 0.86, fault: "idiosyncratic", event: "starship", tags: ["Space"] },
  { q: "Will a major AI lab publicly pause frontier training in 2026?", yes: 0.13, vol: 1_600_000, liq: 95_000, end: "2026-12-31", chg: -0.02, district: "foundry", archetype: "cathedral", spectacle: 2.2, brittle: 0.7, fault: "ai_capability", event: "ai-pause", tags: ["Tech", "AI"] },

  // ── Frontier ─────────────────────────────────────────────────────────────
  { q: "Will Russia and Ukraine sign a formal ceasefire in 2026?", yes: 0.29, vol: 16_800_000, liq: 1_100_000, end: "2026-12-31", chg: 0.07, district: "frontier", archetype: "cathedral", spectacle: 3.9, brittle: 0.81, fault: "global_conflict", event: "ukraine-ceasefire", tags: ["Geopolitics"] },
  { q: "Will Israel and Iran engage in direct military strikes in 2026?", yes: 0.35, vol: 9_400_000, liq: 640_000, end: "2026-12-31", chg: -0.05, district: "frontier", archetype: "stadium", spectacle: 3.7, brittle: 0.66, fault: "global_conflict", event: "israel-iran", tags: ["Geopolitics"] },
  { q: "Will China impose a naval blockade on Taiwan before 2027?", yes: 0.09, vol: 7_200_000, liq: 480_000, end: "2026-12-31", chg: 0.01, district: "frontier", archetype: "cathedral", spectacle: 3.4, brittle: 0.74, fault: "global_conflict", event: "taiwan", tags: ["Geopolitics"] },
  { q: "Will Brent crude close above $110 per barrel in 2026?", yes: 0.24, vol: 3_100_000, liq: 210_000, end: "2026-12-31", chg: 0.03, district: "exchange", archetype: "factory", spectacle: 2.3, brittle: 0.2, fault: "energy_and_climate", fault2: "global_conflict", event: "brent-110", tags: ["Commodities", "Energy"] },

  // ── Colosseum ────────────────────────────────────────────────────────────
  { q: "Will the Kansas City Chiefs win Super Bowl LXI?", yes: 0.18, vol: 11_300_000, liq: 890_000, end: "2027-02-07", chg: -0.02, district: "colosseum", archetype: "stadium", spectacle: 3.0, brittle: 0.99, fault: "idiosyncratic", event: "sb-lxi", tags: ["Sports", "NFL"] },
  { q: "Will Real Madrid win the 2026 Champions League?", yes: 0.22, vol: 6_100_000, liq: 430_000, end: "2026-05-30", chg: 0.04, district: "colosseum", archetype: "stadium", spectacle: 2.8, brittle: 0.98, fault: "idiosyncratic", event: "ucl-2026", tags: ["Sports", "Soccer"] },

  // ── Agora ────────────────────────────────────────────────────────────────
  { q: "Will Taylor Swift announce a new studio album in 2026?", yes: 0.64, vol: 2_800_000, liq: 160_000, end: "2026-12-31", chg: 0.05, district: "agora", archetype: "monument", spectacle: 2.6, brittle: 0.85, fault: "idiosyncratic", event: "swift-album", tags: ["Culture", "Music"] },
  { q: "Will a film with a majority-AI-generated script be nominated for an Oscar by 2027?", yes: 0.11, vol: 1_200_000, liq: 78_000, end: "2027-01-31", chg: -0.01, district: "agora", archetype: "observatory", spectacle: 2.0, brittle: 0.9, fault: "ai_capability", fault2: "idiosyncratic", event: "ai-oscar", tags: ["Culture", "Film"] },
  { q: "Will global average temperature in 2026 set a new record?", yes: 0.58, vol: 2_100_000, liq: 130_000, end: "2027-01-15", chg: 0.02, district: "foundry", archetype: "observatory", spectacle: 2.7, brittle: 0.35, fault: "energy_and_climate", event: "temp-record", tags: ["Climate", "Science"] },
];

/** Build a plausible probability vector: mass on the primary plate, some on a
 *  secondary when one is named, the rest spread thin. Sums to exactly 1. */
function faultVector(primary: FaultLine, secondary?: FaultLine): Record<FaultLine, number> {
  const v = Object.fromEntries(FAULT_LINES.map((f) => [f, 0])) as Record<FaultLine, number>;
  const rest = FAULT_LINES.filter((f) => f !== primary && f !== secondary);
  if (secondary) {
    v[primary] = 0.58;
    v[secondary] = 0.27;
  } else {
    v[primary] = 0.79;
  }
  const spread = 1 - FAULT_LINES.reduce((s, f) => s + v[f], 0);
  for (const f of rest) v[f] = spread / rest.length;
  // Correct float drift so the vector sums to exactly 1.
  const total = FAULT_LINES.reduce((s, f) => s + v[f], 0);
  v[primary] += 1 - total;
  for (const f of FAULT_LINES) v[f] = Number(v[f].toFixed(6));
  return v;
}

// Group seeds into Gamma-shaped events, with tags on the EVENT (not the market)
// and outcomes/prices/tokenIds as JSON-ENCODED STRINGS, exactly as Gamma does.
const byEvent = new Map<string, Seed[]>();
for (const s of SEEDS) {
  const list = byEvent.get(s.event) ?? [];
  list.push(s);
  byEvent.set(s.event, list);
}

let marketId = 500_100;
const rawEvents = [...byEvent.entries()].map(([slug, seeds], ei) => ({
  id: String(90_000 + ei),
  ticker: slug,
  slug,
  title: seeds[0].q,
  description: `Resolution follows the official outcome for: ${seeds[0].q}`,
  startDate: "2026-01-02T00:00:00Z",
  endDate: `${seeds[0].end}T00:00:00Z`,
  image: `https://polymarket.com/images/${slug}.png`,
  icon: `https://polymarket.com/icons/${slug}.png`,
  active: true,
  closed: false,
  archived: false,
  new: false,
  featured: ei < 4,
  restricted: false,
  liquidity: String(seeds.reduce((s, x) => s + x.liq, 0)),
  volume: String(seeds.reduce((s, x) => s + x.vol, 0)),
  openInterest: 0,
  competitive: 0.72,
  enableOrderBook: true,
  negRisk: false,
  commentCount: 120 + ei * 7,
  tags: seeds[0].tags.map((label, ti) => ({
    id: String(100 + ti),
    label,
    slug: label.toLowerCase(),
    forceShow: false,
  })),
  markets: seeds.map((s) => {
    const id = String(marketId++);
    const no = Number((1 - s.yes).toFixed(4));
    return {
      id,
      question: s.q,
      conditionId: `0x${id}${"a3f9".repeat(14)}`.slice(0, 66),
      slug: `${slug}-${id}`,
      groupItemTitle: "",
      // The three JSON-encoded-string fields — the trap the normalizer handles.
      outcomes: JSON.stringify(["Yes", "No"]),
      outcomePrices: JSON.stringify([s.yes.toFixed(4), no.toFixed(4)]),
      clobTokenIds: JSON.stringify([`${id}0001`, `${id}0002`]),
      volume: String(s.vol),
      volumeNum: s.vol,
      liquidity: String(s.liq),
      liquidityNum: s.liq,
      bestBid: Number((s.yes - 0.01).toFixed(4)),
      bestAsk: Number((s.yes + 0.01).toFixed(4)),
      lastTradePrice: s.yes,
      spread: 0.02,
      oneDayPriceChange: s.chg,
      startDate: "2026-01-02T00:00:00Z",
      endDate: `${s.end}T00:00:00Z`,
      endDateIso: s.end,
      image: `https://polymarket.com/images/${slug}.png`,
      icon: `https://polymarket.com/icons/${slug}.png`,
      active: true,
      closed: false,
      archived: false,
      enableOrderBook: true,
      negRisk: false,
    };
  }),
}));

// Two deliberately malformed rows, so the normalizer's warn-and-drop path is
// covered by a test rather than assumed.
rawEvents.push({
  id: "99999",
  ticker: "malformed",
  slug: "malformed",
  title: "Malformed fixtures",
  description: "Rows that must be dropped, not crash the app.",
  startDate: "2026-01-02T00:00:00Z",
  endDate: "2026-12-31T00:00:00Z",
  image: "",
  icon: "",
  active: true,
  closed: false,
  archived: false,
  new: false,
  featured: false,
  restricted: false,
  liquidity: "0",
  volume: "0",
  openInterest: 0,
  competitive: 0,
  enableOrderBook: false,
  negRisk: true,
  commentCount: 0,
  tags: [],
  markets: [
    // Three outcomes -> not binary, must be dropped.
    {
      id: "700001", question: "Which party wins the most seats?",
      conditionId: "0xdead", slug: "multi", groupItemTitle: "",
      outcomes: JSON.stringify(["Democrat", "Republican", "Other"]),
      outcomePrices: JSON.stringify(["0.4", "0.5", "0.1"]),
      clobTokenIds: JSON.stringify(["1", "2", "3"]),
      volume: "1000", volumeNum: 1000, liquidity: "10", liquidityNum: 10,
      bestBid: 0, bestAsk: 0, lastTradePrice: 0, spread: 0, oneDayPriceChange: 0,
      startDate: "2026-01-02T00:00:00Z", endDate: "2026-12-31T00:00:00Z",
      endDateIso: "2026-12-31", image: "", icon: "",
      active: true, closed: false, archived: false, enableOrderBook: true, negRisk: true,
    },
    // Unparseable prices -> must be dropped.
    {
      id: "700002", question: "Broken price encoding?",
      conditionId: "0xbeef", slug: "broken", groupItemTitle: "",
      outcomes: JSON.stringify(["Yes", "No"]),
      outcomePrices: "not-json-at-all",
      clobTokenIds: JSON.stringify(["1", "2"]),
      volume: "500", volumeNum: 500, liquidity: "5", liquidityNum: 5,
      bestBid: 0, bestAsk: 0, lastTradePrice: 0, spread: 0, oneDayPriceChange: 0,
      startDate: "2026-01-02T00:00:00Z", endDate: "2026-12-31T00:00:00Z",
      endDateIso: "2026-12-31", image: "", icon: "",
      active: true, closed: false, archived: false, enableOrderBook: true, negRisk: false,
    },
  ],
});

mkdirSync(join(root, "fixtures", "raw"), { recursive: true });
writeFileSync(
  join(root, "fixtures", "raw", "events.json"),
  JSON.stringify(rawEvents, null, 2),
);

// Normalize with the real production normalizer, so the fixture and the live
// path cannot drift apart.
const { markets, dropped } = normalizeEvents(rawEvents, new Date("2026-01-15"));
const ordered = byVolumeDesc(markets);

writeFileSync(
  join(root, "fixtures", "markets.json"),
  JSON.stringify(
    {
      capturedAt: new Date("2026-01-15").toISOString(),
      gammaQuery: "/events?limit=200&closed=false&active=true",
      schemaVersion: 1,
      synthetic: true,
      markets: ordered,
    },
    null,
    2,
  ),
);

const judgments: Record<string, Judgment> = {};
for (const m of ordered) {
  const seed = SEEDS.find((s) => s.q === m.question);
  if (!seed) continue;
  judgments[m.id] = {
    district: seed.district,
    districtConfidence: 0.72 + (seed.spectacle / 4) * 0.2,
    archetype: seed.archetype,
    spectacle: seed.spectacle,
    brittleness: seed.brittle,
    faultVector: faultVector(seed.fault, seed.fault2),
  };
}

writeFileSync(
  join(root, "fixtures", "judgments.json"),
  JSON.stringify(
    {
      capturedAt: new Date("2026-01-15").toISOString(),
      model: "synthetic-not-jev",
      schemaVersion: 1,
      synthetic: true,
      note: "Hand-authored stand-ins. Run `npm run capture:fixtures` with a TYPESAFE_API_KEY to replace with real Jev output.",
      judgments,
    },
    null,
    2,
  ),
);

console.log(`markets kept:    ${ordered.length}`);
console.log(`markets dropped: ${dropped.length}`, dropped.map((d) => d.reason));
console.log(`judgments:       ${Object.keys(judgments).length}`);
