import { NextRequest, NextResponse } from "next/server";
import { judge, isLive, withFallback } from "@/lib/registry";
import { ReplayJudge } from "@/lib/judge/replay";
import { marketSource } from "@/lib/registry";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Survey the bedrock: which holdings secretly share a driver. */
export async function POST(req: NextRequest) {
  try {
    const { ids } = (await req.json()) as { ids?: string[] };
    const all = await marketSource().listMarkets(24);
    const subset = ids?.length ? all.filter((m) => ids.includes(m.id)) : all;
    if (subset.length < 2) {
      return NextResponse.json(
        { error: "Take at least two positions before surveying the bedrock." },
        { status: 400 },
      );
    }

    const result = await withFallback(
      () => judge().surveyBedrock(subset),
      () => new ReplayJudge().surveyBedrock(subset),
    );
    return NextResponse.json({ ...result, live: isLive() });
  } catch (err) {
    console.error("[survey]", err);
    return NextResponse.json({ error: "Survey failed." }, { status: 500 });
  }
}
