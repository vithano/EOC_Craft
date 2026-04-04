"use client";

import type { ComputedBuildStats } from "../data/gameStats";
import {
  computeEvasionChancePercent,
  computeHitChancePercent,
  computeNonDamagingAilmentEffectPercent,
  LEVEL_100_ENEMY_ACCURACY,
  LEVEL_100_ENEMY_EVASION,
} from "../data/eocFormulas";
import { computeDamageReductionPercentFromArmour } from "../data/formulas";
import { getNexusTierRow } from "../data/nexusEnemyScaling";
import {
  HIT_DAMAGE_TYPE_COLOR_CLASS,
  HIT_DAMAGE_TYPE_LABEL,
} from "../data/damageTypes";

export interface EocStatsPanelProps {
  stats: ComputedBuildStats;
  incomingDamage: number;
  nexusTier: number | null;
}

export default function EocStatsPanel({ stats, incomingDamage, nexusTier }: EocStatsPanelProps) {
  const nexus = nexusTier != null ? getNexusTierRow(nexusTier) : undefined;
  const enemyAccuracy = nexus?.accuracy ?? LEVEL_100_ENEMY_ACCURACY;
  const enemyEvasion = nexus?.evasion ?? LEVEL_100_ENEMY_EVASION;
  const playerAccuracy = stats.accuracy;
  const flatFinalEv = stats.classBonusesActive.includes("mirage") ? 5 : 0;

  const evasionChanceVsEnemy = computeEvasionChancePercent(
    enemyAccuracy,
    stats.evasionRating,
    flatFinalEv
  );
  const hitChanceVsEnemy = computeHitChancePercent(playerAccuracy, enemyEvasion, 0);

  const damageReduction = computeDamageReductionPercentFromArmour(
    stats.armor,
    incomingDamage,
    0,
    90
  );
  const postMit = incomingDamage * Math.max(0, 1 - damageReduction / 100);
  const shockPct = computeNonDamagingAilmentEffectPercent(
    postMit,
    stats.maxLife,
    stats.maxEnergyShield,
    1,
    1,
    1
  );
  const chillPct = computeNonDamagingAilmentEffectPercent(
    postMit,
    stats.maxLife,
    stats.maxEnergyShield,
    1,
    1,
    0.7
  );

  const ac = stats.abilityContribution;
  const hitLabel = ac ? (ac.type === "Spells" ? "Spell hit" : "Ability hit") : "Hit damage";
  const hitSub = ac
    ? `${ac.name} · was ${ac.baselineHitMin}–${ac.baselineHitMax}`
    : "weapon";
  const apsSub = ac
    ? `${stats.aps.toFixed(2)}${ac.type === "Spells" ? " casts/s" : " atk/s"} · was ${ac.baselineAps.toFixed(2)}`
    : `${stats.aps.toFixed(2)} atk/s`;

  const byType = stats.hitDamageByType;
  const multiDamageTypes = byType.length > 1;

  const statBlocks = [
    { label: "Avg + crit", value: stats.avgEffectiveDamage.toFixed(1), sub: "per hit", color: "text-red-400", highlight: true },
    { label: "DPS", value: stats.dps.toFixed(1), sub: apsSub, color: "text-orange-300", highlight: true },
    { label: "Armor", value: stats.armor, sub: `${damageReduction.toFixed(1)}% vs slider`, color: "text-blue-400", highlight: false },
    { label: "Evasion", value: stats.evasionRating, sub: "rating", color: "text-purple-400", highlight: false },
    { label: "Life / ES", value: `${stats.maxLife}`, sub: `ES ${stats.maxEnergyShield}`, color: "text-emerald-400", highlight: false },
    { label: "Mana", value: stats.maxMana, sub: `${stats.manaRegenPerSecond.toFixed(1)}/s regen`, color: "text-sky-400", highlight: false },
    { label: "Crit", value: `${stats.critChance.toFixed(1)}%`, sub: `${stats.critMultiplier}× mult`, color: "text-yellow-400", highlight: false },
    { label: "Evade vs tier", value: `${evasionChanceVsEnemy.toFixed(1)}%`, sub: `enemy acc ${enemyAccuracy}`, color: "text-fuchsia-400", highlight: false },
    { label: "Hit vs tier", value: `${hitChanceVsEnemy.toFixed(1)}%`, sub: `enemy eva ${enemyEvasion}`, color: "text-pink-400", highlight: false },
    { label: "Shock preview", value: `${shockPct.toFixed(1)}%`, sub: "post-mit ailment", color: "text-cyan-400", highlight: false },
    { label: "Chill preview", value: `${chillPct.toFixed(1)}%`, sub: "×0.7 chill", color: "text-sky-400", highlight: false },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>📊</span> EOC build stats
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div
          className={`flex flex-col items-center p-2 rounded-lg border text-center border-zinc-700 bg-zinc-800/50 min-w-0`}
        >
          <span className="text-zinc-500 text-xs mb-1">{hitLabel}</span>
          {multiDamageTypes ? (
            <div className="w-full min-w-0 flex flex-col gap-1 items-stretch">
              {byType.map((row) => (
                <div
                  key={row.type}
                  className={`text-sm font-bold font-mono leading-tight ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}
                >
                  {HIT_DAMAGE_TYPE_LABEL[row.type]} {row.min}–{row.max}
                </div>
              ))}
              <div className="text-zinc-500 text-[10px] font-mono pt-0.5 border-t border-zinc-700/80">
                Σ {stats.hitDamageMin}–{stats.hitDamageMax}
              </div>
            </div>
          ) : (
            <span
              className={`text-base font-bold font-mono ${
                HIT_DAMAGE_TYPE_COLOR_CLASS[byType[0]?.type ?? "physical"]
              }`}
            >
              {byType[0] ? `${byType[0].min}–${byType[0].max}` : `${stats.hitDamageMin}–${stats.hitDamageMax}`}
            </span>
          )}
          <span className="text-zinc-600 text-xs mt-1">{hitSub}</span>
        </div>
        {statBlocks.map(({ label, value, sub, color, highlight }) => (
          <div
            key={label}
            className={`flex flex-col items-center p-2 rounded-lg border text-center
              ${highlight ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-800"}`}
          >
            <span className="text-zinc-500 text-xs mb-1">{label}</span>
            <span className={`text-base font-bold ${color}`}>{value}</span>
            <span className="text-zinc-600 text-xs">{sub}</span>
          </div>
        ))}
      </div>
      <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Attributes</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(
          [
            ["STR", stats.str],
            ["DEX", stats.dex],
            ["INT", stats.int],
          ] as const
        ).map(([label, val]) => (
          <div key={label} className="flex flex-col items-center bg-zinc-800 rounded-lg p-2">
            <span className="text-zinc-500 text-xs">{label}</span>
            <span className="text-zinc-100 font-bold text-base">{val}</span>
          </div>
        ))}
      </div>
      <div className="text-zinc-600 text-xs space-y-1 border-t border-zinc-800 pt-3">
        <div>
          Resists · fire/cold/lightning {stats.fireRes}/{stats.coldRes}/{stats.lightningRes}% (caps{" "}
          {stats.maxFireRes}/{stats.maxColdRes}/{stats.maxLightningRes}) · chaos {stats.chaosRes}% (cap{" "}
          {stats.maxChaosRes})
        </div>
        <div>
          Block {stats.blockChance}% · Dodge {stats.dodgeChance}% · Acc {stats.accuracy} · Mana/atk{" "}
          {stats.manaCostPerAttack.toFixed(1)}
        </div>
        <div>
          After encounter · life +{stats.lifeRecoveryPct}% · ES +{stats.esRecoveryPct}%
        </div>
      </div>
    </div>
  );
}
