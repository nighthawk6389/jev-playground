"use client";

import { useState } from "react";
import { useCity, useScore } from "./store";
import { DISTRICT_META } from "@/lib/city/mapping";
import { FAULT_LABELS } from "@/lib/game/tectonics";
import { scenarioPnL, positionValue } from "@/lib/game/portfolio";
import { MarketList } from "./MarketList";

const PRESETS = [
  "The Fed cuts rates by 50 basis points",
  "A ceasefire is signed in Ukraine",
  "A frontier AI lab announces a major capability jump",
  "A major exchange collapses",
];

const panel: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--edge)",
  borderRadius: 12,
  backdropFilter: "blur(14px)",
  padding: 14,
};

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

export function Hud({ live }: { live: boolean }) {
  const {
    markets, judgments, buildings, cash, positions, selectedId,
    survey, shock, busy, error, priceProvenance, openingNetWorth,
    buy, sellAll, select, clearPositions, setSurvey, setShock, setBusy, setError,
  } = useCity();
  const score = useScore();
  const [shockText, setShockText] = useState(PRESETS[0]);

  // Realised + unrealised, against where the session started.
  const sessionPnL = score.netWorth - openingNetWorth;

  const selected = markets.find((m) => m.id === selectedId);
  const selectedJ = selectedId ? judgments[selectedId] : undefined;
  const selectedB = buildings.find((b) => b.id === selectedId);
  const selectedDelta = selectedId ? (useCity.getState().priceDeltas[selectedId] ?? 0) : 0;

  const heldPositions = selected
    ? positions.filter((p) => p.marketId === selected.id)
    : [];
  const heldHere = heldPositions.length > 0;
  const heldPnL = selected
    ? heldPositions.reduce(
        (sum, p) => sum + positionValue(p, selected) - Math.abs(p.stake),
        0,
      )
    : 0;

  const impacts = new Map((shock?.effects ?? []).map((e) => [e.marketId, e.impact]));
  const pnl = shock ? scenarioPnL({ cash, positions }, markets, impacts) : 0;

  async function runSurvey() {
    const ids = positions.filter((p) => Math.abs(p.stake) > 0).map((p) => p.marketId);
    if (ids.length < 2) {
      setError("Take at least two positions before surveying the bedrock.");
      return;
    }
    setBusy("survey");
    setError(null);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Survey failed.");
      setSurvey(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Survey failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runStress() {
    setBusy("stress");
    setError(null);
    try {
      const res = await fetch("/api/stress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shock: shockText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stress test failed.");
      setShock(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stress test failed.");
    } finally {
      setBusy(null);
    }
  }

  const integrityColor =
    score.integrity > 0.66 ? "var(--good)" : score.integrity > 0.36 ? "var(--gold)" : "var(--bad)";

  return (
    <>
      {/* ── Left column: scoreboard over the market index ────────────── */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          bottom: 16,
          width: 300,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ ...panel, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 19, letterSpacing: "-0.01em" }}>Oddsville</h1>
            <span style={{ ...label, fontSize: 9 }}>{live ? "live" : "fixture"}</span>
            {priceProvenance && (
              <span
                style={{
                  ...label,
                  fontSize: 9,
                  marginLeft: "auto",
                  color: priceProvenance === "live" ? "var(--good)" : "var(--gold)",
                }}
              >
                ● {priceProvenance === "live" ? "live odds" : "sim odds"}
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
              marginTop: 11,
            }}
          >
            <Stat title="Cash" value={`$${Math.round(cash).toLocaleString()}`} />
            <Stat title="Net worth" value={`$${Math.round(score.netWorth).toLocaleString()}`} />
            <Stat
              title="Session P&L"
              value={`${sessionPnL >= 0 ? "+" : "−"}$${Math.abs(Math.round(sessionPnL)).toLocaleString()}`}
              tone={Math.abs(sessionPnL) < 1 ? undefined : sessionPnL > 0 ? "good" : "bad"}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...label }}>
              <span>Structural integrity</span>
              <span style={{ color: integrityColor, fontVariantNumeric: "tabular-nums" }}>
                {(score.integrity * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, marginTop: 5 }}>
              <div
                style={{
                  height: "100%",
                  width: `${score.integrity * 100}%`,
                  background: integrityColor,
                  borderRadius: 3,
                  transition: "width 260ms ease, background 260ms ease",
                }}
              />
            </div>
            <div style={{ ...label, marginTop: 7, fontSize: 9.5, lineHeight: 1.5 }}>
              Score {score.score.toLocaleString()} · {score.exposureCount} holdings
            </div>
          </div>
        </div>

        <MarketList />
      </div>

      {/* ── The two Jev actions ──────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 16, right: 16, ...panel, width: 300 }}>
        <div style={label}>Stress test the city</div>
        <p style={{ margin: "6px 0 9px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
          Describe any news. Jev judges how each market moves, and the ground
          shakes accordingly.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setShockText(p)}
              style={{
                ...chip,
                borderColor: shockText === p ? "var(--gold)" : "var(--edge)",
                color: shockText === p ? "var(--gold)" : "var(--muted)",
              }}
            >
              {p.split(" ").slice(0, 3).join(" ")}…
            </button>
          ))}
        </div>

        <input
          value={shockText}
          onChange={(e) => setShockText(e.target.value)}
          placeholder="…or write your own"
          maxLength={280}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 12,
            background: "rgba(0,0,0,0.3)", color: "var(--ink)",
            border: "1px solid var(--edge)", borderRadius: 7, outline: "none",
          }}
        />

        <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
          <button onClick={runStress} disabled={busy !== null} style={primaryBtn}>
            {busy === "stress" ? "Judging…" : "Shake the city"}
          </button>
          <button onClick={runSurvey} disabled={busy !== null} style={ghostBtn}>
            {busy === "survey" ? "Surveying…" : "Survey bedrock"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 9, fontSize: 11, color: "var(--bad)" }}>{error}</div>
        )}

        {shock && (
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--edge)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span style={{ color: "var(--muted)" }}>Scenario P&amp;L</span>
              <span style={{ color: pnl >= 0 ? "var(--good)" : "var(--bad)", fontVariantNumeric: "tabular-nums" }}>
                {pnl >= 0 ? "+" : "−"}${Math.abs(Math.round(pnl)).toLocaleString()}
              </span>
            </div>
            <Provenance kind={shock.provenance} />
          </div>
        )}

        {survey && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--edge)" }}>
            <div style={label}>Bedrock survey</div>
            {survey.links.filter((l) => l.direction !== "unrelated" && l.shared > 0.3).length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0" }}>
                No shared bedrock found. Your holdings stand on separate ground.
              </p>
            ) : (
              survey.links
                .filter((l) => l.direction !== "unrelated" && l.shared > 0.3)
                .slice(0, 4)
                .map((l) => {
                  const a = markets.find((m) => m.id === l.aId);
                  const b = markets.find((m) => m.id === l.bId);
                  return (
                    <div key={`${l.aId}-${l.bId}`} style={{ fontSize: 10.5, margin: "7px 0", lineHeight: 1.45 }}>
                      <span style={{ color: l.direction === "opposite" ? "var(--good)" : "var(--bad)" }}>
                        {l.direction === "opposite" ? "HEDGE" : "SHARED"} {(l.shared * 100).toFixed(0)}%
                      </span>
                      <div style={{ color: "var(--muted)" }}>
                        {trim(a?.question)} ↔ {trim(b?.question)}
                      </div>
                    </div>
                  );
                })
            )}
            <Provenance kind={survey.provenance} />
          </div>
        )}
      </div>

      {/* ── Selected building — bottom centre, clear of the list ─────── */}
      {selected && selectedJ && selectedB && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            ...panel,
            width: 430,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ ...label, color: DISTRICT_META[selectedJ.district].color }}>
              {DISTRICT_META[selectedJ.district].label} · {selectedJ.archetype}
            </div>
            <button onClick={() => select(null)} style={{ ...chip, padding: "1px 7px" }}>
              ✕
            </button>
          </div>

          <div style={{ fontSize: 13.5, margin: "7px 0 9px", lineHeight: 1.4 }}>
            {selected.question}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
            <Stat
              title="Yes"
              value={`${(selected.yesPrice * 100).toFixed(0)}%`}
              tone={
                Math.abs(selectedDelta) < 1e-6
                  ? undefined
                  : selectedDelta > 0
                    ? "good"
                    : "bad"
              }
            />
            <Stat title="Volume" value={`$${(selected.volumeUsd / 1e6).toFixed(1)}M`} />
            <Stat title="Fault" value={FAULT_LABELS[selectedB.faultLine]} small />
            <Stat
              title="Your P&L"
              value={
                heldHere
                  ? `${heldPnL >= 0 ? "+" : "−"}$${Math.abs(Math.round(heldPnL)).toLocaleString()}`
                  : "—"
              }
              tone={!heldHere || Math.abs(heldPnL) < 1 ? undefined : heldPnL > 0 ? "good" : "bad"}
            />
          </div>

          <div style={{ ...label, marginTop: 10, fontSize: 9.5 }}>
            Jev · spectacle {selectedJ.spectacle.toFixed(1)}/4 · brittleness{" "}
            {(selectedJ.brittleness * 100).toFixed(0)}% · district confidence{" "}
            {(selectedJ.districtConfidence * 100).toFixed(0)}%
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            <span style={{ ...label, fontSize: 9, color: "var(--gold)" }}>YES</span>
            {[250, 500, 1000].map((amt) => (
              <button
                key={amt}
                onClick={() => buy(selected.id, amt)}
                disabled={amt > cash}
                style={{ ...primaryBtn, flex: 1, opacity: amt > cash ? 0.4 : 1 }}
              >
                ${amt}
              </button>
            ))}
            <button
              onClick={() => buy(selected.id, -500)}
              disabled={cash < 500}
              style={{ ...ghostBtn, flex: 1, opacity: cash < 500 ? 0.4 : 1 }}
            >
              NO $500
            </button>
            {heldHere && (
              <button
                onClick={() => sellAll(selected.id)}
                style={{ ...ghostBtn, flex: 1, borderColor: "rgba(244,84,79,0.5)", color: "var(--bad)" }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────── */}
      <div style={{ position: "absolute", bottom: 16, right: 16, ...panel, width: 176 }}>
        <div style={label}>Districts</div>
        <div style={{ marginTop: 7 }}>
          {Object.entries(DISTRICT_META).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 0" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{v.label}</span>
            </div>
          ))}
        </div>
        <div style={{ ...label, marginTop: 9, fontSize: 9, lineHeight: 1.6 }}>
          Height = volume · Glow = P(yes)
        </div>
        {positions.length > 0 && (
          <button onClick={clearPositions} style={{ ...chip, marginTop: 9, width: "100%" }}>
            Reset city
          </button>
        )}
      </div>
    </>
  );
}

function Stat({
  title,
  value,
  small,
  tone,
}: {
  title: string;
  value: string;
  small?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div style={label}>{title}</div>
      <div
        style={{
          fontSize: small ? 11 : 15,
          marginTop: 3,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.25,
          color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : undefined,
          transition: "color 200ms ease",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Never let the UI imply a simulated answer came from the model. */
function Provenance({ kind }: { kind: "live" | "recorded" | "simulated" }) {
  const text =
    kind === "live"
      ? "Judged live by Jev"
      : kind === "recorded"
        ? "Recorded judgment (offline demo)"
        : "Simulated offline — not a model judgment";
  return (
    <div style={{ ...label, marginTop: 7, fontSize: 9, color: kind === "simulated" ? "var(--gold)" : "var(--muted)" }}>
      {text}
    </div>
  );
}

function trim(s?: string) {
  if (!s) return "";
  return s.length > 38 ? `${s.slice(0, 38)}…` : s;
}

const chip: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--edge)",
  color: "var(--muted)",
  borderRadius: 6,
  padding: "3px 7px",
  fontSize: 10,
};

const primaryBtn: React.CSSProperties = {
  flex: 1,
  background: "rgba(255, 210, 125, 0.13)",
  border: "1px solid rgba(255, 210, 125, 0.45)",
  color: "var(--gold)",
  borderRadius: 7,
  padding: "7px 6px",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const ghostBtn: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "1px solid var(--edge)",
  color: "var(--ink)",
  borderRadius: 7,
  padding: "7px 6px",
  fontSize: 11,
  whiteSpace: "nowrap",
};
