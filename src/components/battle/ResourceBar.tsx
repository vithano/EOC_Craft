"use client";

import { useMemo } from "react";

export type ResourceBarProps = {
  label: string;
  current: number;
  max: number;
  colorClass: string;
  bgClass?: string;
  showNumbers?: boolean;
  rightAligned?: boolean;
  compact?: boolean;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default function ResourceBar({
  label,
  current,
  max,
  colorClass,
  bgClass = "bg-zinc-950",
  showNumbers = true,
  rightAligned = false,
  compact = false,
}: ResourceBarProps) {
  const pct = useMemo(() => clamp01(max > 0 ? current / max : 0), [current, max]);
  const pctText = (pct * 100).toFixed(0);

  return (
    <div className="space-y-1">
      <div
        className={[
          "flex items-baseline justify-between text-[10px] tracking-wider uppercase",
          rightAligned ? "flex-row-reverse" : "",
        ].join(" ")}
      >
        <span className="text-zinc-500">{label}</span>
        {showNumbers && (
          <span className="text-zinc-400 font-mono tabular-nums">
            {Math.max(0, Math.round(current))}/{Math.max(0, Math.round(max))}{" "}
            <span className="text-zinc-600">({pctText}%)</span>
          </span>
        )}
      </div>

      <div
        className={[
          "relative overflow-hidden rounded-md border border-zinc-700/80",
          compact ? "h-2.5" : "h-3.5",
          bgClass,
        ].join(" ")}
      >
        <div
          className={[
            "absolute inset-y-0 left-0",
            colorClass,
            "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
          ].join(" ")}
          style={{ width: `${(pct * 100).toFixed(2)}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

