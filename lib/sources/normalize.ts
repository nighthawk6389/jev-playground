import { Market, MarketSchema } from "@/lib/ports";

/**
 * Gamma returns `outcomes`, `outcomePrices` and `clobTokenIds` as JSON-ENCODED
 * STRINGS, e.g. "[\"Yes\", \"No\"]" — but website-scraped captures show the
 * already-parsed array form. Tolerate both rather than betting on one.
 */
export function parseMaybeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface NormalizeReport {
  markets: Market[];
  dropped: Array<{ id: string; reason: string }>;
}

/**
 * Flatten a Gamma /events response into binary markets.
 *
 * Warns and drops bad rows rather than throwing: a demo that renders 21 of 24
 * buildings beats one that white-screens. Tags are hoisted from the event,
 * since they do not exist on the market object.
 */
export function normalizeEvents(raw: unknown, now = new Date()): NormalizeReport {
  const events = Array.isArray(raw) ? raw : [];
  const markets: Market[] = [];
  const dropped: Array<{ id: string; reason: string }> = [];

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const e = event as Record<string, unknown>;

    const tags = Array.isArray(e.tags)
      ? (e.tags as Array<Record<string, unknown>>)
          .map((t) => (typeof t?.label === "string" ? t.label : null))
          .filter((t): t is string => !!t)
      : [];

    const rawMarkets = Array.isArray(e.markets) ? e.markets : [];
    for (const rm of rawMarkets) {
      if (!rm || typeof rm !== "object") continue;
      const m = rm as Record<string, unknown>;
      const id = String(m.id ?? "");
      const reject = (reason: string) => dropped.push({ id: id || "<no id>", reason });

      if (!id) {
        reject("missing id");
        continue;
      }
      if (m.closed === true || m.archived === true || m.active === false) {
        reject("closed/archived/inactive");
        continue;
      }

      const outcomes = parseMaybeJsonArray(m.outcomes);
      const prices = parseMaybeJsonArray(m.outcomePrices).map(Number);

      // Only binary Yes/No markets become buildings; negRisk multi-outcome
      // events would need a different visual grammar.
      if (outcomes.length !== 2) {
        reject(`not binary (${outcomes.length} outcomes)`);
        continue;
      }
      if (prices.length !== 2 || prices.some((p) => !Number.isFinite(p))) {
        reject("unparseable outcomePrices");
        continue;
      }
      const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === "yes");
      const yesPrice = prices[yesIndex === -1 ? 0 : yesIndex];
      if (!Number.isFinite(yesPrice) || yesPrice < 0 || yesPrice > 1) {
        reject("unusable yes price");
        continue;
      }

      const question = typeof m.question === "string" ? m.question.trim() : "";
      if (!question) {
        reject("missing question");
        continue;
      }

      const volumeUsd = num(m.volumeNum) ?? num(m.volume) ?? 0;
      const endDate = typeof m.endDate === "string" ? m.endDate : "";
      if (endDate && new Date(endDate).getTime() < now.getTime()) {
        reject("already past end date");
        continue;
      }

      const candidate = {
        id,
        conditionId: String(m.conditionId ?? id),
        question,
        slug: String(m.slug ?? e.slug ?? id),
        yesPrice,
        volumeUsd,
        liquidityUsd: num(m.liquidityNum) ?? num(m.liquidity) ?? 0,
        endDate,
        oneDayChange: num(m.oneDayPriceChange) ?? 0,
        tags,
      };

      const parsed = MarketSchema.safeParse(candidate);
      if (!parsed.success) {
        reject(parsed.error.issues[0]?.message ?? "schema mismatch");
        continue;
      }
      markets.push(parsed.data);
    }
  }

  return { markets, dropped };
}

/** Highest-volume first. We sort in code because Gamma's `order` param spelling
 *  is inconsistent across sources and not worth depending on. */
export function byVolumeDesc(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => b.volumeUsd - a.volumeUsd);
}
