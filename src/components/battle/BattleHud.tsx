"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EncounterResult, EncounterTimelinePoint } from "../../battle/types";
import ResourceBar from "./ResourceBar";
import SpeedControls from "./SpeedControls";
import FloatingTextLayer, { type FloatingText } from "./FloatingTextLayer";

function clamp(x: number, lo: number, hi: number) {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function formatShort(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function upperBoundByT(timeline: EncounterTimelinePoint[], t: number): number {
  // Returns first index with timeline[i].t > t
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type BattleHudProps = {
  result: EncounterResult;
  playerLabel?: string;
  enemyLabel?: string;
  playerMax: { life: number; energyShield: number; mana: number };
  enemyMax: { life: number; energyShield: number };
};

type DerivedEvent = {
  t: number;
  side: "player" | "enemy";
  text: string;
  tone: "damage" | "heal" | "info";
};

export default function BattleHud({
  result,
  playerLabel = "Player",
  enemyLabel = "Enemy",
  playerMax,
  enemyMax,
}: BattleHudProps) {
  const timeline = result.timeline ?? [];
  const duration = Math.max(0, result.durationSeconds || 0);
  const enemyMaxEsFromTimeline = useMemo(() => {
    if (!timeline.length) return 0;
    let mx = 0;
    for (const p of timeline) mx = Math.max(mx, p.enemy.energyShield || 0);
    return mx;
  }, [timeline]);
  const effectiveEnemyMaxEs = Math.max(0, enemyMax.energyShield || 0, enemyMaxEsFromTimeline);

  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playheadSec, setPlayheadSec] = useState(0);
  const lastRafRef = useRef<number | null>(null);
  const playheadRef = useRef(0);
  const isPlayingRef = useRef(true);
  const speedRef = useRef(1);

  useEffect(() => {
    playheadRef.current = playheadSec;
  }, [playheadSec]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const events = useMemo((): DerivedEvent[] => {
    const out: DerivedEvent[] = [];
    for (const line of result.log) {
      const dmg = line.damage ?? 0;
      if (!Number.isFinite(dmg) || dmg <= 0) continue;
      if (line.kind !== "player_attack" && line.kind !== "enemy_attack" && line.kind !== "dot_tick") continue;

      let side: "player" | "enemy" = "enemy";
      if (line.kind === "player_attack") side = "enemy";
      else if (line.kind === "enemy_attack") side = "player";
      else if (line.kind === "dot_tick") {
        side = /on you/i.test(line.message) ? "player" : "enemy";
      }

      out.push({
        t: line.t,
        side,
        text: `-${formatShort(dmg)}`,
        tone: "damage",
      });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }, [result.log]);

  const [floaters, setFloaters] = useState<FloatingText[]>([]);
  const lastEventIdxRef = useRef(0);

  // Reset playback when a new result arrives
  useEffect(() => {
    setPlayheadSec(0);
    playheadRef.current = 0;
    lastRafRef.current = null;
    lastEventIdxRef.current = 0;
    setFloaters([]);
    setIsPlaying(true);
    isPlayingRef.current = true;
    setSpeed(1);
    speedRef.current = 1;
  }, [result]);

  // Main animation loop
  useEffect(() => {
    let alive = true;
    let rafId: number | null = null;

    function tick(nowMs: number) {
      if (!alive) return;
      const last = lastRafRef.current;
      lastRafRef.current = nowMs;
      const dtReal = last == null ? 0 : Math.max(0, (nowMs - last) / 1000);

      if (isPlayingRef.current && speedRef.current > 0) {
        const next = clamp(playheadRef.current + dtReal * speedRef.current, 0, duration);
        if (next !== playheadRef.current) {
          playheadRef.current = next;
          setPlayheadSec(next);
        }
        if (next >= duration - 1e-9) {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [duration]);

  // Spawn floating damage numbers as playhead crosses log events
  useEffect(() => {
    const t = playheadSec;
    let idx = lastEventIdxRef.current;
    if (idx > events.length) idx = events.length;

    // If user seeks backwards, reset event cursor and clear floaters.
    if (idx > 0 && events[idx - 1] && events[idx - 1]!.t > t + 1e-6) {
      lastEventIdxRef.current = 0;
      setFloaters([]);
      idx = 0;
    }

    const newly: FloatingText[] = [];
    while (idx < events.length && events[idx]!.t <= t + 1e-9) {
      const e = events[idx]!;
      newly.push({
        id: `${e.t}-${idx}-${e.side}`,
        side: e.side,
        text: e.text,
        tone: e.tone,
        startedAtSec: e.t,
        durationSec: 0.9,
      });
      idx++;
    }
    if (newly.length) {
      lastEventIdxRef.current = idx;
      setFloaters((prev) => {
        const kept = prev.filter((f) => t - f.startedAtSec <= f.durationSec + 0.1);
        return [...kept, ...newly].slice(-40);
      });
    } else {
      setFloaters((prev) => prev.filter((f) => t - f.startedAtSec <= f.durationSec + 0.1));
    }
  }, [events, playheadSec]);

  const frame = useMemo(() => {
    if (!timeline.length) return null;
    const i = Math.max(0, upperBoundByT(timeline, playheadSec) - 1);
    return timeline[i] ?? null;
  }, [timeline, playheadSec]);

  const player = frame?.player ?? { life: playerMax.life, energyShield: playerMax.energyShield, mana: playerMax.mana };
  const enemy = frame?.enemy ?? { life: enemyMax.life, energyShield: enemyMax.energyShield };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_260px] gap-0">
          {/* Player panel */}
          <div className="border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold text-zinc-100">{playerLabel}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Left</div>
            </div>
            <div className="mt-3 space-y-2">
              <ResourceBar label="Life" current={player.life} max={playerMax.life} colorClass="bg-rose-600" />
              {playerMax.energyShield > 0 && (
                <ResourceBar label="ES" current={player.energyShield} max={playerMax.energyShield} colorClass="bg-sky-600" />
              )}
              {playerMax.mana > 0 && (
                <ResourceBar label="Mana" current={player.mana} max={playerMax.mana} colorClass="bg-indigo-600" />
              )}
            </div>
          </div>

          {/* Arena */}
          <div className="relative min-h-[220px] md:min-h-[260px] bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_rgba(0,0,0,0)_55%),linear-gradient(to_bottom,_rgba(24,24,27,0.25),_rgba(0,0,0,0.55))]">
            <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-3 px-3 py-2">
              <div className="rounded-full border border-zinc-700/70 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-300">
                {result.winner === "player" ? "Victory" : result.winner === "enemy" ? "Defeat" : "Timeout"}
                <span className="text-zinc-500"> · </span>
                <span className="font-mono tabular-nums">{duration.toFixed(1)}s</span>
              </div>
            </div>

            <div className="absolute inset-x-0 top-10 flex items-center justify-center px-3">
              <div className="w-full max-w-[520px] space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <ResourceBar
                    label="You"
                    current={player.life}
                    max={playerMax.life}
                    colorClass="bg-rose-600"
                    compact
                    showNumbers={false}
                  />
                  <div className="space-y-1">
                    <ResourceBar
                      label={enemyLabel}
                      current={enemy.life}
                      max={enemyMax.life}
                      colorClass="bg-emerald-600"
                      compact
                      showNumbers={false}
                      rightAligned
                    />
                    {effectiveEnemyMaxEs > 0 && (
                      <ResourceBar
                        label="ES"
                        current={enemy.energyShield}
                        max={effectiveEnemyMaxEs}
                        colorClass="bg-sky-600"
                        compact
                        showNumbers={false}
                        rightAligned
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-between px-10">
              <div className="h-16 w-16 rounded-full border border-zinc-700 bg-zinc-900/70 shadow-[0_0_0_3px_rgba(0,0,0,0.35)]" />
              <div className="h-16 w-16 rounded-full border border-zinc-700 bg-zinc-900/70 shadow-[0_0_0_3px_rgba(0,0,0,0.35)]" />
            </div>

            <FloatingTextLayer nowSec={playheadSec} items={floaters} />
          </div>

          {/* Enemy panel */}
          <div className="border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold text-zinc-100">{enemyLabel}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Right</div>
            </div>
            <div className="mt-3 space-y-2">
              <ResourceBar
                label="Life"
                current={enemy.life}
                max={enemyMax.life}
                colorClass="bg-emerald-600"
                rightAligned
              />
              {effectiveEnemyMaxEs > 0 && (
                <ResourceBar
                  label="ES"
                  current={enemy.energyShield}
                  max={effectiveEnemyMaxEs}
                  colorClass="bg-sky-600"
                  rightAligned
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <SpeedControls
        durationSeconds={duration}
        playheadSeconds={playheadSec}
        isPlaying={isPlaying}
        speed={speed}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onSpeedChange={(s) => {
          setSpeed(s);
          if (s <= 0) setIsPlaying(false);
        }}
        onSeek={(t) => {
          const next = clamp(t, 0, duration);
          setPlayheadSec(next);
          playheadRef.current = next;
          if (next >= duration - 1e-9) setIsPlaying(false);
        }}
        presetSpeeds={[0.25, 0.5, 1, 2, 4, 8]}
        maxSpeed={8}
      />
    </div>
  );
}

