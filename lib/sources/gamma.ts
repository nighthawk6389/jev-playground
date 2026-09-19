import "server-only";
import { Market, MarketSource } from "@/lib/ports";
import { byVolumeDesc, normalizeEvents } from "./normalize";

const BASE = process.env.GAMMA_BASE_URL ?? "https://gamma-api.polymarket.com";

/**
 * Live Polymarket source.
 *
 * Proxied server-side deliberately: Polymarket geo-blocks by IP, so a browser
 * call would use the visitor's IP, and this also keeps us inside rate limits
 * via the Next data cache.
 *
 * NOTE: unverified against a live response — this container's egress proxy
 * blocks gamma-api.polymarket.com. The normalizer is defensive for that reason.
 */
export class GammaMarketSource implements MarketSource {
  readonly kind = "live" as const;

  async listMarkets(limit: number): Promise<Market[]> {
    // No `order` param: its spelling is inconsistent across Polymarket's own
    // sources, so we over-fetch and sort by volume in code instead.
    const url = `${BASE}/events?limit=200&closed=false&active=true`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Gamma ${res.status} for ${url}`);

    const { markets, dropped } = normalizeEvents(await res.json());
    if (dropped.length) {
      console.warn(`[gamma] dropped ${dropped.length} markets`, dropped.slice(0, 5));
    }
    return byVolumeDesc(markets).slice(0, limit);
  }
}
