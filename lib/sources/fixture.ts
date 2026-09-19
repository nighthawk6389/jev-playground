import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureMarketsSchema, Market, MarketSource } from "@/lib/ports";

/** Parsed with the SAME schema the live path uses, so drift fails loudly. */
export class FixtureMarketSource implements MarketSource {
  readonly kind = "fixture" as const;

  async listMarkets(limit: number): Promise<Market[]> {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "markets.json"), "utf8"),
    );
    return FixtureMarketsSchema.parse(raw).markets.slice(0, limit);
  }
}
