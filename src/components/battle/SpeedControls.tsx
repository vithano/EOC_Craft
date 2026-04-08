"use client";

import { useMemo } from "react";

export type SpeedControlsProps = {
  durationSeconds: number;
  playheadSeconds: number;
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (t: number) => void;
  presetSpeeds?: number[];
  maxSpeed?: number;
};

function clamp(x: number, lo: number, hi: number) {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

export default function SpeedControls({
  durationSeconds,
  playheadSeconds,
  isPlaying,
  speed,
  onTogglePlay,
  onSpeedChange,
  onSeek,
  presetSpeeds,
  maxSpeed = 8,
}: SpeedControlsProps) {
  const presets = useMemo(() => presetSpeeds ?? [0.25, 0.5, 1, 2, 4, 8], [presetSpeeds]);
  const dur = Math.max(0, durationSeconds || 0);
  const t = clamp(playheadSeconds, 0, dur);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className={[
              "px-3 py-1.5 rounded-lg text-sm font-medium border",
              isPlaying ? "bg-zinc-950 border-zinc-700 text-zinc-100" : "bg-blue-600 border-blue-500 text-white",
            ].join(" ")}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 uppercase tracking-wider">Speed</span>
            <span className="font-mono text-zinc-200 tabular-nums">{speed.toFixed(2)}×</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                className={[
                  "px-2 py-1 rounded-md text-xs border",
                  Math.abs(speed - s) < 1e-9
                    ? "bg-zinc-950 border-zinc-600 text-zinc-100"
                    : "bg-black/20 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700",
                ].join(" ")}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_220px] md:items-center">
          <label className="space-y-1">
            <div className="flex justify-between text-[10px] tracking-wider uppercase text-zinc-500">
              <span>Timeline</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {t.toFixed(2)}s / {dur.toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={dur}
              step={0.01}
              value={t}
              onChange={(e) => onSeek(Number(e.target.value) || 0)}
              className="w-full accent-blue-500"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between text-[10px] tracking-wider uppercase text-zinc-500">
              <span>Speed slider</span>
              <span className="font-mono tabular-nums text-zinc-400">{speed.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0}
              max={maxSpeed}
              step={0.25}
              value={clamp(speed, 0, maxSpeed)}
              onChange={(e) => onSpeedChange(clamp(Number(e.target.value) || 0, 0, maxSpeed))}
              className="w-full accent-blue-500"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

