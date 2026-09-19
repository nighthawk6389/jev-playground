# Oddsville

A living isometric city built from Polymarket prediction markets, zoned by
[TypeSafe](https://typesafe.ai)'s **Jev** model.

Every building is a market. Jev reads the market questions and decides what each
one *is*; code decides how tall it stands, how brightly it burns, and what
happens when the ground shakes.

```bash
npm install
npm run dev          # fully playable, no API keys required
```

---

## The idea

Prediction markets are natural language. `"Will Powell be replaced as Fed Chair
before 2027?"` carries meaning that no tag, category or string comparison can
reach. That is exactly the gap Jev fills: it returns **typed judgments and
calibrated probabilities** that code can compute with.

So the work is split down the middle:

| | |
| --- | --- |
| **Code owns** | Height from volume, glow from price, P&L, concentration math, camera, physics, layout, time-to-resolution |
| **Jev owns** | Which district a market belongs to, what building form its *character* implies, how much spectacle it carries, whether it snaps or drifts, and which real-world driver it rests on |

Nothing asks the model for a fact the code already has. The end date is a field;
asking a model to read it back would be waste.

## The mechanic: fault lines

The city sits on tectonic plates. Jev scores each market across ~8 named
real-world drivers and returns the **full probability distribution**, not just
the winner. Everything after that is arithmetic:

- plate affinity between two markets = **cosine similarity** of their vectors
- portfolio concentration = **Herfindahl index** over position-weighted exposure
- **structural integrity = 1 − HHI**, rescaled

This is the part worth looking at. Consider two markets:

```
"Will Republicans hold the House in the 2026 midterms?"   tags: Politics
"Will Jerome Powell be replaced as Fed Chair before 2027?" tags: Economics
```

Different tags. Different districts. No shared words. But they load the same
bedrock, and a portfolio holding both is far less diversified than it looks.
No amount of string matching finds that. Jev does.

Because the judgments are stored as reusable vectors, changing a weight, a
threshold or a display filter costs **zero additional inference**.

### Direction matters

A shared driver where one market rises as the other falls is a **hedge**, and it
*improves* integrity. A shared driver where both move together is concentration
risk. That asymmetry is what makes the mechanic strategic rather than decorative.

## The stress test

Type any news in plain English — *"Iran and Israel sign a ceasefire"* — and Jev
scores every market on a signed 5-level rubric. Code rank-normalizes the answers
and drives the quake: affected buildings shake, glow green or red, brittle ones
shudder harder, shared seams light up.

`score` returns a **fractional expected value** plus confidence, so it maps
directly onto signed quake magnitude. Low confidence shimmers instead of
committing — a `noul` near 0.5 means genuinely undecided, not "medium".

## How to play

**Controls:** drag to orbit, scroll to zoom. Click a building — or a row in the
market list — to select it. The two stay in sync: clicking a building scrolls its
row into view, clicking a row drops a gold beacon on the building.

1. **Read the city.** Height = volume. Glow = P(yes). Colour = district, which
   Jev assigned by reading the question. Spires mark landmarks.
2. **Scan the list.** Every market, searchable by question, district or fault
   line, sortable by volume / price / biggest mover. Live ▲▼ deltas per row.
3. **Take positions.** `YES $250/$500/$1000` or `NO $500`. Held buildings get a
   gold plinth. `Close` sells at the current price and realises the P&L.
4. **Watch integrity.** It falls as your holdings pile onto one fault line. Even
   a single holding only scores ~67% — one market is not a portfolio.
5. **Survey the bedrock** (needs ≥2 positions). Glowing seams appear between
   holdings that share a driver. Red = concentration risk, green = hedge.
6. **Stress test.** Preset or free text. The city quakes, green for rises, red
   for falls, and you see the scenario P&L before it happens.

**Prices move on their own.** A ticker polls every 6 seconds, so open positions
gain and lose without you doing anything — net worth and session P&L are live.
Live mode re-fetches Polymarket; offline it's a deterministic mean-reverting
drift, labelled **sim odds** in the corner so it's never mistaken for real.

```
score = netWorth × (0.5 + 0.5 × integrity)
```

A fragile city is worth less than a resilient one of the same value. Both halves
are live: net worth moves with the market, integrity moves with your choices.

`?ticker=0` freezes prices, `?fx=0` drops shadows and postprocessing.

## Running it

### Zero-config (default)

`npm run dev` works with no keys at all. The app ships committed fixtures so
the whole loop is playable immediately.

### With real data

```bash
cp .env.example .env.local
# add TYPESAFE_API_KEY, set DATA_MODE=live
npm run capture:fixtures   # fetches live Polymarket + judges with Jev
npm run dev
```

`capture:fixtures` writes the **raw** Gamma response alongside the normalized
output, so the parser stays testable offline against a real payload.

### Deploying to Vercel

Push, import, and set `TYPESAFE_API_KEY` and `DATA_MODE=live`. It runs without
them too — it just serves the fixture city. Routes are `runtime = "nodejs"` with
`maxDuration = 60`, and every Jev call carries an explicit time budget, because
the SDK's defaults allow a worst case beyond Vercel Hobby's ceiling.

## Architecture

```
app/page.tsx              Server Component: fetch + judge, pass plain JSON
components/city/
  CityClient.tsx          "use client" boundary that makes ssr:false legal
  Scene.tsx               the r3f Canvas
  Building.tsx            procedural mesh, baked window emissive map
  FaultLines.tsx          the glowing bedrock seams
lib/
  ports.ts                zod schemas — the single source of every type
  typesafe/questions.ts   every Jev judgment, in one reviewable file
  judge/{typesafe,replay}.ts   live and offline judges behind one interface
  sources/{gamma,fixture}.ts   live and fixture market sources
  registry.ts             the ONLY place that branches on data mode
  game/tectonics.ts       cosine similarity, HHI, integrity
```

Fixture mode is a **transport, not a branch**: the TypeSafe SDK takes an
injectable `fetch` and honors `TYPESAFE_BASE_URL`, so the same calling code,
question definitions and parsing run in both modes.

## Tests

```bash
npm test      # 50 unit tests: normalizer, tectonics, mapping, scoring, drift, P&L
npm run build && npm start &
npm run smoke # 25 end-to-end checks against a real WebGL render
```

The smoke test asserts the **data→geometry mapping** through a `window.__oddsville`
snapshot — that the highest-volume market really is the tallest building, that
concentrating a portfolio really does drop integrity, that prices actually move
across two ticks and **net worth moves with them** — plus a canvas non-blankness
check, which is what catches shader failures that DOM assertions miss entirely.

## Notes on the build

A few things that cost real time, recorded so they don't again:

- **`@react-three/fiber@9.7` peers `react ">=19 <19.3"`.** React 19.3 fails to
  install; drei's looser `^19` re-pulls it unless overridden. Hence the exact
  pins and the `overrides` block.
- **drei's `<SoftShadows>` is broken on three ≥ 0.182.** It calls
  `unpackRGBAToDepth`, which three removed — it fails as a shader link error and
  renders the scene **black**. This uses `PCFSoftShadowMap` with a tightly
  fitted shadow frustum instead.
- **`three` is pinned exactly**: `postprocessing@6.39.5` peers
  `three ">= 0.168.0 < 0.187.0"`.
- **`ssr: false` is illegal in a Server Component** in Next 16 — it must live in
  a `"use client"` wrapper.
- Gamma returns `outcomes`, `outcomePrices` and `clobTokenIds` as
  **JSON-encoded strings**, not arrays.

## Honest limits

- The committed fixtures are **synthetic**, not captured Jev output — the
  development environment could not reach `api.typesafe.ai`. Every fixture file
  records `synthetic: true`. Run `capture:fixtures` to replace them with real
  judgments.
- The live Gamma adapter is written from Polymarket's own source and real
  captured responses, but has **not** been exercised against a live response.
  The normalizer is defensive and warns-and-drops for that reason.
- Free-text shocks can never hit a recorded fixture, so offline they fall
  through to a deterministic simulator. The UI labels that clearly as
  **"Simulated offline — not a model judgment"**. It is never passed off as Jev.
