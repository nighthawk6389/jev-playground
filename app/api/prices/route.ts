import { NextResponse } from "next/server";
import { isLive, marketSource } from "@/lib/registry";
import { FixtureMarketSource } from "@/lib/sources/fixture";
import { driftMarkets } from "@/lib/game/drift";

export const runtime = "nodejs";
export const maxDuration = 30;
// Never cache: the whole point is that this returns something new each poll.
export const dynamic = "force-dynamic";

/** The process start, so offline drift advances from a stable origin. */
const CLOCK_ORIGIN = Date.now();

/**
 * Current YES prices for every market in the city.
 *
 * Live: re-fetches Polymarket, so odds genuinely move and open positions gain
 * and lose against their entry price.
 *
 * Offline: a deterministic drift, labelled `simulated` so the client can say so.
 */
export async function GET() {
  try {
    if (isLive()) {
      const markets = await marketSource().listMarkets(24);
      const prices = Object.fromEntries(markets.map((m) => [m.id, m.yesPrice]));
      return NextResponse.json(
        { provenance: "live", at: Date.now(), prices },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const markets = await new FixtureMarketSource().listMarkets(24);
    const prices = driftMarkets(markets, {
      elapsedSeconds: (Date.now() - CLOCK_ORIGIN) / 1000,
    });
    return NextResponse.json(
      { provenance: "simulated", at: Date.now(), prices },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[prices]", err);
    return NextResponse.json({ error: "Price fetch failed." }, { status: 500 });
  }
}
