"use client";

import { useState } from 'react';
import type { ComputedStats } from '../data/formulas';

interface BuildSummaryProps {
  selectedClass: string;
  equipped: Record<string, string>;
  activeUpgrades: string[];
  stats: ComputedStats;
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
        <div
          className={`h-full rounded-full transition-all ${fillColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BuildSummary({ selectedClass, equipped, activeUpgrades, stats }: BuildSummaryProps) {
  const [buildName, setBuildName] = useState('My Build');

  const equippedCount = Object.values(equipped).filter((v) => v && v !== 'none').length;
  const upgradeCount = activeUpgrades.length;

  const damageRating = Math.min(100, (stats.effectiveDamage / 300) * 100);
  const defenseRating = Math.min(100, (stats.armor / 200) * 100 * 0.5 + (stats.evasion / 100) * 100 * 0.5);
  const utilityRating = Math.min(100, (stats.health / 1000) * 100 * 0.5 + (stats.mana / 600) * 100 * 0.5);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>📋</span> Build Summary
      </div>
      <input
        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:border-blue-500"
        value={buildName}
        onChange={(e) => setBuildName(e.target.value)}
        placeholder="Build name..."
      />
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Class</span>
          <span className="text-zinc-200 capitalize">{selectedClass}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Items Equipped</span>
          <span className={equippedCount >= 7 ? 'text-emerald-400' : equippedCount >= 4 ? 'text-yellow-400' : 'text-zinc-200'}>
            {equippedCount} / 9
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Upgrades Active</span>
          <span className={upgradeCount >= 4 ? 'text-emerald-400' : upgradeCount >= 2 ? 'text-yellow-400' : 'text-zinc-200'}>
            {upgradeCount} / 5
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Eff. Damage</span>
          <span className="text-red-400">{stats.effectiveDamage}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Survivability</span>
          <span className="text-emerald-400">{stats.health} HP / {stats.damageReduction}% DR</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Crit Rate</span>
          <span className="text-zinc-200">{stats.critChance}%</span>
        </div>
      </div>
      <RatingBar label="Damage Rating" value={damageRating} fillColor="bg-orange-500" />
      <RatingBar label="Defense Rating" value={defenseRating} fillColor="bg-blue-500" />
      <RatingBar label="Utility Rating" value={utilityRating} fillColor="bg-emerald-500" />
    </div>
  );
}
