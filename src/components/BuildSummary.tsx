"use client";

import { useState } from "react";
import { MAX_PLANNER_LEVEL } from "../data/gameClasses";
import { EQUIPMENT_SLOTS, getEquippedEntry, type EquippedEntry } from "../data/equipment";
import type { ComputedBuildStats } from "../data/gameStats";

interface BuildSummaryProps {
  equipped: Record<string, EquippedEntry>;
  upgradeTotalPoints: number;
  classesWithPoints: number;
  stats: ComputedBuildStats;
}

interface RatingBarProps {
  label: string;
  value: number;
  fillColor: string;
}

function RatingBar({ label, value, fillColor }: RatingBarProps) {
  const pct = Math.min(100, value);
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-zinc-500 uppercase tracking-wide">{label}</span>
        <span className="text-zinc-600 tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-[#1a1624] rounded-full overflow-hidden border border-amber-900/20">
        <div className={`h-full rounded-full transition-all ${fillColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BuildSummary({
  equipped,
  upgradeTotalPoints,
  classesWithPoints,
  stats,
}: BuildSummaryProps) {
  const [buildName, setBuildName] = useState("My Build");

  const equippedCount = EQUIPMENT_SLOTS.filter(
    (slot) => getEquippedEntry(equipped, slot).itemId !== "none"
  ).length;

  const damageRating = Math.min(100, (stats.dps / 80) * 100);
  const defenseRating = Math.min(
    100,
    (stats.armour / 400) * 50 + (stats.evasionRating / 2000) * 50 + stats.blockChance * 0.3
  );
  const utilityRating = Math.min(
    100,
    (stats.maxLife / 800) * 40 + (stats.maxMana / 400) * 30 + (stats.maxEnergyShield / 500) * 30
  );

  const activeClassSummary =
    Object.entries(stats.classLevelsActive)
      .filter(([, lv]) => lv > 0)
      .map(([id, lv]) => `${id} ${lv}`)
      .join(", ") || "—";

  return (
    <div className="bg-[#0f0d16] border border-amber-900/30 rounded-lg p-3 sm:p-3.5">
      <div className="font-cinzel text-amber-200/80 text-[10px] uppercase tracking-widest font-bold mb-2.5">
        Build Summary
      </div>
      <input
        className="w-full bg-[#1a1624] border border-amber-900/30 text-zinc-200 text-xs rounded px-2.5 py-1.5 mb-2.5 focus:outline-none focus:border-amber-600/60 placeholder-zinc-700"
        value={buildName}
        onChange={(e) => setBuildName(e.target.value)}
        placeholder="Build name..."
      />
      <div className="flex flex-col gap-1 mb-2.5 text-xs border-t border-amber-900/20 pt-2">
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">Classes</span>
          <span className="text-amber-200/80 tabular-nums">{classesWithPoints}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">Level</span>
          <span
            className={
              upgradeTotalPoints >= MAX_PLANNER_LEVEL
                ? "text-emerald-400 tabular-nums"
                : upgradeTotalPoints >= MAX_PLANNER_LEVEL * 0.75
                  ? "text-yellow-400 tabular-nums"
                  : "text-amber-200/70 tabular-nums"
            }
          >
            {upgradeTotalPoints}/{MAX_PLANNER_LEVEL}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px] shrink-0">Active</span>
          <span className="text-zinc-400 text-right break-all">{activeClassSummary}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">Equipped</span>
          <span
            className={
              equippedCount >= 8 ? "text-emerald-400 tabular-nums" : equippedCount >= 5 ? "text-yellow-400 tabular-nums" : "text-amber-200/70 tabular-nums"
            }
          >
            {equippedCount} / {EQUIPMENT_SLOTS.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">DPS</span>
          <span className="text-red-400 tabular-nums">{stats.dps.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">Pools</span>
          <span className="text-emerald-400/80 text-right">
            {stats.maxLife}hp · {stats.maxEnergyShield}es · {stats.maxMana}mp
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 uppercase tracking-wide text-[10px]">Bonuses</span>
          <span className="text-zinc-500 text-right">
            {stats.classBonusesActive.length ? `${stats.classBonusesActive.length} active` : "—"}
          </span>
        </div>
      </div>
      <RatingBar label="Damage rating" value={damageRating} fillColor="bg-orange-500" />
      <RatingBar label="Defense rating" value={defenseRating} fillColor="bg-blue-500" />
      <RatingBar label="Utility rating" value={utilityRating} fillColor="bg-emerald-500" />
    </div>
  );
}
