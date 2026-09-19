import CityClient from "@/components/city/CityClient";
import { marketSource, judge, isLive, withFallback } from "@/lib/registry";
import { ReplayJudge } from "@/lib/judge/replay";
import { buildCity } from "@/lib/city/mapping";

/**
 * Server Component. Fetches and judges the city, then hands plain JSON to the
 * client boundary — no Dates, no class instances crossing the RSC boundary.
 */
export const revalidate = 60;

export default async function Page() {
  const markets = await marketSource().listMarkets(24);
  const judgments = await withFallback(
    () => judge().judgeMarkets(markets),
    () => new ReplayJudge().judgeMarkets(markets),
  );
  const buildings = buildCity(markets, judgments);

  return (
    <CityClient
      markets={markets}
      judgments={judgments}
      buildings={buildings}
      live={isLive()}
    />
  );
}
