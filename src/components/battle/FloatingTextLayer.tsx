"use client";

import { useMemo } from "react";

export type FloatingText = {
  id: string;
  side: "player" | "enemy";
  text: string;
  tone?: "damage" | "heal" | "info";
  startedAtSec: number;
  durationSec: number;
};

export type FloatingTextLayerProps = {
  nowSec: number;
  items: FloatingText[];
};

function easeOutCubic(x: number) {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

export default function FloatingTextLayer({ nowSec, items }: FloatingTextLayerProps) {
  const active = useMemo(() => {
    return items
      .map((it) => {
        const age = nowSec - it.startedAtSec;
        const p = it.durationSec > 0 ? age / it.durationSec : 1;
        return { it, age, p };
      })
      .filter((x) => x.age >= 0 && x.p <= 1);
  }, [items, nowSec]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {active.map(({ it, p }) => {
        const rise = 42 * easeOutCubic(p);
        const opacity = 1 - easeOutCubic(p);
        const x = it.side === "player" ? "30%" : "70%";
        const tone =
          it.tone === "heal"
            ? "text-emerald-300"
            : it.tone === "info"
              ? "text-zinc-200"
              : "text-rose-200";
        return (
          <div
            key={it.id}
            className={["absolute top-[52%] -translate-x-1/2 font-mono text-sm drop-shadow", tone].join(" ")}
            style={{
              left: x,
              transform: `translate(-50%, ${-rise}px)`,
              opacity,
              textShadow: "0 1px 0 rgba(0,0,0,0.8)",
            }}
          >
            {it.text}
          </div>
        );
      })}
    </div>
  );
}

