import { choice, noul, score } from "@typesafe-ai/sdk";
import { Market } from "@/lib/ports";

/**
 * Every judgment Jev makes, in one place.
 *
 * Division of labor: code owns geometry, pricing, dates and all arithmetic.
 * Jev owns only what requires reading a market question and understanding what
 * it means. Nothing here asks the model for a fact the code already holds.
 */

/* ── Tier 1: per-market judgments, batched over one shared state ─────────── */

export const districtQuestion = (path: string) =>
  choice(`Which quarter of the city does the market at \`${path}\` belong in?`, {
    capitol:
      "Elections, legislation, appointments, court rulings, domestic government.",
    exchange:
      "Crypto, macroeconomics, interest rates, equities, commodities, company earnings.",
    colosseum:
      "Sports and competitive events decided by a scheduled contest.",
    foundry:
      "Technology, artificial intelligence, space, medicine, scientific results.",
    agora:
      "Culture, entertainment, awards, media, celebrity and internet phenomena.",
    frontier:
      "Geopolitics, armed conflict, treaties, and relations between nations.",
  });

export const archetypeQuestion = (path: string) =>
  choice(
    `Judge the CHARACTER of the market at \`${path}\` — not merely its topic — ` +
      `and choose the building form that best embodies it.`,
    {
      tower: "Ambitious and growth-driven; a race upward toward a number or milestone.",
      courthouse: "Decided by a formal ruling, vote, or official judgment.",
      cathedral: "Long-horizon and quasi-permanent; a question of faith in an outcome.",
      casino: "Close to a coin flip; driven by chance more than by process.",
      factory: "Grinding and cumulative; produced by steady output over time.",
      stadium: "A scheduled contest between named rivals with a crowd watching.",
      observatory: "Discovery and measurement; waiting for evidence to arrive.",
      monument: "Commemorative or identity-defining; about legacy and reputation.",
    },
  );

export const spectacleQuestion = (path: string) =>
  score(
    `How much public drama and attention surrounds the market at \`${path}\`?`,
    [
      "Technical or obscure; only specialists would follow it.",
      "Followed by an interested niche community.",
      "Broad public awareness within its country or field.",
      "A major national story that dominates headlines for days.",
      "A defining global event that almost everyone is watching.",
    ],
  );

export const brittlenessQuestion = (path: string) =>
  noul(
    `Is the market at \`${path}\` decided by one discrete event rather than a gradual drift?`,
    {
      true: "A single announcement, vote, ruling, or match settles it at a moment in time.",
      false:
        "It resolves by accumulating conditions, gradual measurement, or a slow trend.",
    },
  );

/**
 * The tectonic question. We keep the full probability distribution, not just
 * the winning label — that vector is what lets code compute graded plate
 * affinity by cosine similarity, with no further inference.
 */
export const faultLineQuestion = (path: string) =>
  choice(
    `Which real-world driver most determines the outcome of the market at \`${path}\`? ` +
      `Consider what single piece of news would move its price most.`,
    {
      us_elections:
        "US electoral politics: candidates, campaigns, control of Congress, primaries.",
      fed_and_rates:
        "Monetary policy, inflation, interest rates, and central bank decisions.",
      ai_capability:
        "Progress and setbacks in artificial intelligence capability and adoption.",
      crypto_regulation:
        "Regulation, enforcement, and institutional adoption of digital assets.",
      global_conflict:
        "Armed conflict, ceasefires, sanctions, and relations between states.",
      energy_and_climate:
        "Energy supply and prices, climate policy, and extreme weather.",
      corporate_leadership:
        "The fate of specific executives, companies, and corporate governance.",
      idiosyncratic:
        "Driven by its own particulars; no broader shared driver applies.",
    },
  );

/** All Tier-1 questions for one market, keyed so answers map back by id. */
export function tierOneQuestions(markets: Market[]) {
  const questions: Record<string, ReturnType<typeof choice | typeof noul | typeof score>> = {};
  markets.forEach((m, i) => {
    const path = `markets[${i}].question`;
    questions[`district__${m.id}`] = districtQuestion(path);
    questions[`archetype__${m.id}`] = archetypeQuestion(path);
    questions[`spectacle__${m.id}`] = spectacleQuestion(path);
    questions[`brittleness__${m.id}`] = brittlenessQuestion(path);
    questions[`fault__${m.id}`] = faultLineQuestion(path);
  });
  return questions;
}

/** The state Jev reads. Only what a judgment actually needs. */
export function tierOneState(markets: Market[]) {
  return {
    today: new Date().toISOString().slice(0, 10),
    markets: markets.map((m) => ({
      question: m.question,
      yesProbability: Number(m.yesPrice.toFixed(3)),
      volumeUsd: Math.round(m.volumeUsd),
      endDate: m.endDate,
      tags: m.tags,
    })),
  };
}

/* ── Tier 2: the bedrock survey, pairwise but batched into ONE request ───── */

export const sharedDriverQuestion = (aPath: string, bPath: string) =>
  noul(
    `Would a single piece of real-world news move BOTH the market at \`${aPath}\` ` +
      `and the market at \`${bPath}\`?`,
    {
      true: "One event would meaningfully move the price of both markets.",
      false: "Their outcomes depend on separate, unrelated developments.",
    },
  );

export const driverDirectionQuestion = (aPath: string, bPath: string) =>
  choice(
    `Suppose news arrives that raises the probability of the market at \`${aPath}\`. ` +
      `What most likely happens to the market at \`${bPath}\`?`,
    {
      same: "It also becomes more likely — the two rise and fall together.",
      opposite: "It becomes less likely — one gaining means the other loses.",
      unrelated: "It is essentially unaffected.",
    },
  );

/* ── Tier 3: the stress test ─────────────────────────────────────────────── */

/**
 * Signed 5-level rubric. `score` returns a fractional expected value, which
 * becomes signed quake magnitude after rank-normalization in code.
 *
 * The questions cannot see each other, so absolute calibration drifts between
 * markets. We put the whole city in `state` so each is judged in context, then
 * rank-normalize before driving the animation.
 */
export const shockImpactQuestion = (path: string) =>
  score(
    `Given the news in \`shock\`, how would the probability of the market at ` +
      `\`${path}\` change?`,
    [
      "Collapses: the YES outcome becomes close to impossible.",
      "Drops materially: clearly less likely than before.",
      "Barely moves: the news has no meaningful bearing on it.",
      "Rises materially: clearly more likely than before.",
      "Spikes: the YES outcome becomes close to certain.",
    ],
  );

export function stressState(shock: string, markets: Market[]) {
  return {
    shock,
    today: new Date().toISOString().slice(0, 10),
    markets: markets.map((m) => ({
      question: m.question,
      yesProbability: Number(m.yesPrice.toFixed(3)),
    })),
  };
}
