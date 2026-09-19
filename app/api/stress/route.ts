import { NextRequest, NextResponse } from "next/server";
import { judge, isLive, marketSource, withFallback } from "@/lib/registry";
import { ReplayJudge } from "@/lib/judge/replay";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Stress test: free-text shock -> typed per-market judgment -> a quake. */
export async function POST(req: NextRequest) {
  try {
    const { shock } = (await req.json()) as { shock?: string };
    const text = (shock ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Describe a shock first." }, { status: 400 });
    }
    if (text.length > 280) {
      return NextResponse.json({ error: "Keep the shock under 280 characters." }, { status: 400 });
    }

    const markets = await marketSource().listMarkets(24);
    const result = await withFallback(
      () => judge().stressTest(text, markets),
      () => new ReplayJudge().stressTest(text, markets),
    );
    return NextResponse.json({ ...result, live: isLive() });
  } catch (err) {
    console.error("[stress]", err);
    return NextResponse.json({ error: "Stress test failed." }, { status: 500 });
  }
}
