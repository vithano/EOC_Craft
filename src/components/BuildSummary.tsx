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
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-500">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>📋</span> Build summary
      </div>
      <input
        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:border-blue-500"
        value={buildName}
        onChange={(e) => setBuildName(e.target.value)}
        placeholder="Build name..."
      />
      <div className="flex flex-col gap-2 mb-4 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Classes with points</span>
          <span className="text-zinc-200">{classesWithPoints}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Level</span>
          <span
            className={
              upgradeTotalPoints >= MAX_PLANNER_LEVEL
                ? "text-emerald-400"
                : upgradeTotalPoints >= MAX_PLANNER_LEVEL * 0.75
                  ? "text-yellow-400"
                  : "text-zinc-200"
            }
          >
            {upgradeTotalPoints}/{MAX_PLANNER_LEVEL}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-400 shrink-0">Active classes</span>
          <span className="text-zinc-300 text-xs text-right break-all">{activeClassSummary}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Items equipped</span>
          <span
            className={
              equippedCount >= 8 ? "text-emerald-400" : equippedCount >= 5 ? "text-yellow-400" : "text-zinc-200"
            }
          >
            {equippedCount} / {EQUIPMENT_SLOTS.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">DPS</span>
          <span className="text-red-400">{stats.dps.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Pools</span>
          <span className="text-emerald-400 text-xs text-right">
            {stats.maxLife} life · {stats.maxEnergyShield} ES · {stats.maxMana} mana
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Bonuses</span>
          <span className="text-zinc-400 text-xs text-right">
            {stats.classBonusesActive.length ? `${stats.classBonusesActive.length} active` : "none"}
          </span>
        </div>
      </div>
      <RatingBar label="Damage rating" value={damageRating} fillColor="bg-orange-500" />
      <RatingBar label="Defense rating" value={defenseRating} fillColor="bg-blue-500" />
      <RatingBar label="Utility rating" value={utilityRating} fillColor="bg-emerald-500" />
    </div>
  );
}
