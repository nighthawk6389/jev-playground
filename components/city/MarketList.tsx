"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCity } from "./store";
import { DISTRICT_META } from "@/lib/city/mapping";
import { FAULT_LABELS } from "@/lib/game/tectonics";
import { positionValue } from "@/lib/game/portfolio";

type SortKey = "volume" | "price" | "move" | "district";

/**
 * A scannable index of every market, wired to the same `selectedId` the 3D
 * scene uses — so clicking a row highlights the building and clicking a
 * building scrolls the row into view.
 */
export function MarketList() {
  const {
    markets, judgments, buildings, positions, selectedId, priceDeltas,
    select, hover,
  } = useCity();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("volume");
  const [heldOnly, setHeldOnly] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const held = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      if (Math.abs(p.stake) > 0) m.set(p.marketId, (m.get(p.marketId) ?? 0) + p.stake);
    }
    return m;
  }, [positions]);

  const buildingById = useMemo(
    () => new Map(buildings.map((b) => [b.id, b])),
    [buildings],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = markets.filter((m) => {
      if (heldOnly && !held.has(m.id)) return false;
      if (!q) return true;
      const j = judgments[m.id];
      const b = buildingById.get(m.id);
      return (
        m.question.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        (j ? DISTRICT_META[j.district].label.toLowerCase().includes(q) : false) ||
        (b ? FAULT_LABELS[b.faultLine].toLowerCase().includes(q) : false)
      );
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "price":
          return b.yesPrice - a.yesPrice;
        case "move":
          return Math.abs(priceDeltas[b.id] ?? 0) - Math.abs(priceDeltas[a.id] ?? 0);
        case "district": {
          const da = judgments[a.id]?.district ?? "";
          const db = judgments[b.id]?.district ?? "";
          return da.localeCompare(db) || b.volumeUsd - a.volumeUsd;
        }
        default:
          return b.volumeUsd - a.volumeUsd;
      }
    });
    return list;
  }, [markets, judgments, buildingById, query, sort, heldOnly, held, priceDeltas]);

  // Scene -> list: when a building is clicked in 3D, bring its row into view.
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Markets</span>
        <span style={{ ...labelStyle, color: "var(--muted)", fontSize: 9 }}>
          {rows.length}/{markets.length}
        </span>
        <button
          onClick={() => setHeldOnly((v) => !v)}
          style={{
            ...chip,
            marginLeft: "auto",
            borderColor: heldOnly ? "var(--gold)" : "var(--edge)",
            color: heldOnly ? "var(--gold)" : "var(--muted)",
          }}
        >
          Held
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search question, district, fault…"
        data-market-search
        style={search}
      />

      <div style={{ display: "flex", gap: 4, margin: "7px 0 4px" }}>
        {(["volume", "price", "move", "district"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            style={{
              ...chip,
              flex: 1,
              padding: "3px 0",
              borderColor: sort === k ? "var(--gold)" : "var(--edge)",
              color: sort === k ? "var(--gold)" : "var(--muted)",
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <div style={scroller}>
        {rows.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "10px 2px" }}>
            Nothing matches “{query}”.
          </div>
        )}

        {rows.map((m) => {
          const j = judgments[m.id];
          const b = buildingById.get(m.id);
          const delta = priceDeltas[m.id] ?? 0;
          const stake = held.get(m.id);
          const isSel = selectedId === m.id;
          const color = j ? DISTRICT_META[j.district].color : "#6b7694";

          const pos = positions.find((p) => p.marketId === m.id);
          const pnl = pos ? positionValue(pos, m) - Math.abs(pos.stake) : 0;

          return (
            <button
              key={m.id}
              ref={(el) => {
                if (el) rowRefs.current.set(m.id, el);
                else rowRefs.current.delete(m.id);
              }}
              data-market-row={m.id}
              onClick={() => select(isSel ? null : m.id)}
              onMouseEnter={() => hover(m.id)}
              onMouseLeave={() => hover(null)}
              style={{
                ...row,
                background: isSel ? "rgba(255, 210, 125, 0.13)" : "transparent",
                borderColor: isSel ? "rgba(255, 210, 125, 0.5)" : "transparent",
              }}
            >
              <span style={{ ...dot, background: color }} />

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={question}>{m.question}</span>
                <span style={meta}>
                  {b ? FAULT_LABELS[b.faultLine] : "—"} · $
                  {(m.volumeUsd / 1e6).toFixed(1)}M
                  {stake !== undefined && (
                    <span style={{ color: "var(--gold)" }}>
                      {" "}· {stake > 0 ? "YES" : "NO"} ${Math.abs(stake).toLocaleString()}
                      {Math.abs(pnl) >= 1 && (
                        <span style={{ color: pnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                          {" "}{pnl >= 0 ? "+" : "−"}${Math.abs(Math.round(pnl))}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </span>

              <span style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={price}>{(m.yesPrice * 100).toFixed(0)}%</span>
                <span
                  style={{
                    ...move,
                    color:
                      delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--muted)",
                  }}
                >
                  {delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"}${Math.abs(delta * 100).toFixed(1)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--edge)",
  borderRadius: 12,
  backdropFilter: "blur(14px)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  flex: 1,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const search: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "6px 9px",
  fontSize: 11.5,
  background: "rgba(0,0,0,0.3)",
  color: "var(--ink)",
  border: "1px solid var(--edge)",
  borderRadius: 7,
  outline: "none",
};

const scroller: React.CSSProperties = {
  overflowY: "auto",
  minHeight: 0,
  flex: 1,
  marginRight: -6,
  paddingRight: 6,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  width: "100%",
  textAlign: "left",
  border: "1px solid transparent",
  borderRadius: 7,
  padding: "6px 7px",
  marginBottom: 2,
  color: "var(--ink)",
  transition: "background 120ms ease",
};

const dot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 2,
  marginTop: 4,
  flexShrink: 0,
};

const question: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.35,
  // Two lines then ellipsis — keeps every row the same scannable height.
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
} as React.CSSProperties;

const meta: React.CSSProperties = {
  display: "block",
  fontSize: 9.5,
  color: "var(--muted)",
  marginTop: 2,
};

const price: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontVariantNumeric: "tabular-nums",
};

const move: React.CSSProperties = {
  display: "block",
  fontSize: 9,
  fontVariantNumeric: "tabular-nums",
  marginTop: 1,
};

const chip: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--edge)",
  color: "var(--muted)",
  borderRadius: 6,
  padding: "3px 7px",
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
