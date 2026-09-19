import "server-only";
import { Judge, MarketSource } from "@/lib/ports";
import { FixtureMarketSource } from "@/lib/sources/fixture";
import { GammaMarketSource } from "@/lib/sources/gamma";
import { ReplayJudge } from "@/lib/judge/replay";
import { TypeSafeJudge } from "@/lib/judge/typesafe";

/**
 * The ONLY place in the app that branches on data mode.
 *
 * Live requires an explicit opt-in AND a key: a missing key silently falling
 * back keeps the demo playable instead of 500ing on a fresh deploy.
 */
export function isLive(): boolean {
  return process.env.DATA_MODE === "live" && !!process.env.TYPESAFE_API_KEY?.trim();
}

export function marketSource(): MarketSource {
  return isLive() ? new GammaMarketSource() : new FixtureMarketSource();
}

export function judge(): Judge {
  return isLive() ? new TypeSafeJudge() : new ReplayJudge();
}

/** Live judging can fail for reasons the demo shouldn't die on (rate limit,
 *  timeout, abort). Fall back rather than break the city. */
export async function withFallback<T>(
  attempt: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    console.warn("[oddsville] live judge failed, using offline judge:", err);
    return fallback();
  }
}
