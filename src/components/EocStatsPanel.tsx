"use client";

import type { ComputedBuildStats } from "../data/gameStats";
import {
  BASE_SHOCK_CHILL_DURATION_SEC,
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

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-zinc-400 text-xs">{label}</span>
      <span className="text-zinc-100 text-xs font-mono text-right">
        {value}
        {sub && <span className="text-zinc-500 ml-1">{sub}</span>}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-zinc-500 text-[10px] uppercase tracking-widest mt-3 mb-1 border-b border-zinc-800 pb-0.5">
      {label}
    </div>
  );
}

export default function EocStatsPanel({ stats, incomingDamage, nexusTier }: EocStatsPanelProps) {
  const nexus = nexusTier != null ? getNexusTierRow(nexusTier) : undefined;
  const enemyAccuracy = nexus?.accuracy ?? LEVEL_100_ENEMY_ACCURACY;
  const enemyEvasion = nexus?.evasion ?? LEVEL_100_ENEMY_EVASION;
  const flatFinalEv = stats.classBonusesActive.includes("mirage") ? 5 : 0;

  // Evasion vs attacks and vs spells (spells use half evasion rating)
  const evasionVsAttacks = computeEvasionChancePercent(enemyAccuracy, stats.evasionRating, flatFinalEv);
  const evasionVsSpells = computeEvasionChancePercent(enemyAccuracy, stats.evasionRating / 2, flatFinalEv);
  const hitChanceVsEnemy = computeHitChancePercent(stats.accuracy, enemyEvasion, 0);

  // Armour DR by damage type
  const drPhys = computeDamageReductionPercentFromArmour(stats.armour, incomingDamage, 0, 90);
  const drEle = computeDamageReductionPercentFromArmour(
    stats.armour * stats.armourVsElementalMultiplier,
    incomingDamage,
    0,
    90
  );
  const drChaos = computeDamageReductionPercentFromArmour(
    stats.armour * stats.armourVsChaosMultiplier,
    incomingDamage,
    0,
    90
  );

  // Shock stats
  const shockChance = Math.min(100, stats.elementalAilmentChance + stats.shockInflictChanceBonus);
  const shockEffectInc = stats.nonDamagingAilmentEffectIncreasedPercent;
  const shockDuration = BASE_SHOCK_CHILL_DURATION_SEC * (1 + stats.ailmentDurationBonus / 100);

  // Ailment effect preview (post-mit)
  const damageReductionForPreview = drPhys;
  const postMit = incomingDamage * Math.max(0, 1 - damageReductionForPreview / 100);
  const shockEffectPreview = computeNonDamagingAilmentEffectPercent(
    postMit,
    stats.maxLife,
    stats.maxEnergyShield,
    1 + shockEffectInc / 100,
    1,
    1
  );

  // Crit multiplier as bonus % above no-crit
  const critBonusPct = Math.round((stats.critMultiplier - 1) * 100);

  // Life recovery on kill (flat + % of max life)
  const lifeOnKill =
    (stats.flatLifeOnKill ?? 0) +
    Math.round(stats.maxLife * ((stats.lifeRecoveredOnKillPercent ?? 0) / 100));

  const ac = stats.abilityContribution;
  const hitLabel = ac ? (ac.type === "Spells" ? "Spell hit" : "Ability hit") : "Hit damage";
  const byType = stats.hitDamageByType;
  const multiDamageTypes = byType.length > 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-3">
        <span>📊</span> EOC build stats
        {ac && (
          <span className="ml-auto text-zinc-500 text-xs font-normal normal-case">
            {ac.name} · lv{ac.abilityLevel} · {ac.attunementPct}% att
          </span>
        )}
      </div>

      {/* ── Hit damage block ── */}
      <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 mb-3">
        <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">{hitLabel}</div>
        {multiDamageTypes ? (
          <div className="flex flex-col gap-0.5">
            {byType.map((row) => (
              <div
                key={row.type}
                className={`text-sm font-bold font-mono ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}
              >
                {HIT_DAMAGE_TYPE_LABEL[row.type]} {row.min}–{row.max}
              </div>
            ))}
            <div className="text-zinc-400 text-xs font-mono border-t border-zinc-700/60 pt-0.5 mt-0.5">
              Total {stats.hitDamageMin}–{stats.hitDamageMax}
            </div>
          </div>
        ) : (
          <span
            className={`text-lg font-bold font-mono ${
              HIT_DAMAGE_TYPE_COLOR_CLASS[byType[0]?.type ?? "physical"]
            }`}
          >
            {byType[0] ? `${byType[0].min}–${byType[0].max}` : `${stats.hitDamageMin}–${stats.hitDamageMax}`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        {/* ── Left column ── */}
        <div>
          <SectionHeader label="Offensive" />
          <StatRow
            label="Attacks per second"
            value={`${stats.aps.toFixed(2)}`}
            sub={`(${stats.strikesPerAttack} hits/atk)`}
          />
          <StatRow
            label="DPS"
            value={stats.dps.toFixed(1)}
            sub={`avg hit ${stats.avgEffectiveDamage.toFixed(1)}`}
          />
          <StatRow label="Mana cost" value={stats.manaCostPerAttack.toFixed(0)} />
          <StatRow
            label="Accuracy rating"
            value={stats.accuracy}
            sub={`(${hitChanceVsEnemy.toFixed(0)}% hit)`}
          />
          <StatRow label="Critical hit chance" value={`${stats.critChance.toFixed(1)}%`} />
          <StatRow label="Critical damage multiplier" value={`+${critBonusPct}%`} />

          {shockChance > 0 && (
            <>
              <SectionHeader label="Shock" />
              <StatRow label="Chance to inflict shock" value={`${shockChance.toFixed(0)}%`} />
              {shockEffectInc > 0 && (
                <StatRow label="Increased effect" value={`${shockEffectInc.toFixed(0)}%`} />
              )}
              <StatRow label="Duration" value={`${shockDuration.toFixed(2)}s`} />
              <StatRow label="Effect preview" value={`${Math.min(50, shockEffectPreview).toFixed(1)}%`} sub="inc dmg taken" />
            </>
          )}

          <SectionHeader label="Attributes" />
          <StatRow label="Strength" value={stats.str} />
          <StatRow label="Dexterity" value={stats.dex} />
          <StatRow label="Intelligence" value={stats.int} />
        </div>

        {/* ── Right column ── */}
        <div>
          <SectionHeader label="Defensive" />
          <StatRow
            label="Armour"
            value={stats.armour}
            sub={`(${drPhys.toFixed(0)}% phys, ${drEle.toFixed(0)}% ele, ${drChaos.toFixed(0)}% chaos)`}
          />
          <StatRow
            label="Evasion rating"
            value={stats.evasionRating}
            sub={`(${evasionVsAttacks.toFixed(0)}% atk, ${evasionVsSpells.toFixed(0)}% spell)`}
          />
          <StatRow label="Energy shield" value={stats.maxEnergyShield} />
          <StatRow label="Life" value={stats.maxLife} />
          <StatRow label="Chance to dodge" value={`${stats.dodgeChance.toFixed(0)}%`} />
          {stats.blockChance > 0 && (
            <StatRow label="Chance to block" value={`${stats.blockChance.toFixed(0)}%`} />
          )}
          {(stats.reducedPhysicalDamageTaken ?? 0) > 0 && (
            <StatRow label="Reduced physical damage taken" value={(stats.reducedPhysicalDamageTaken ?? 0).toFixed(0)} />
          )}

          <SectionHeader label="Resistances" />
          <StatRow
            label="Fire resistance"
            value={`${stats.fireRes}%`}
            sub={`(${stats.maxFireRes}% max)`}
          />
          <StatRow
            label="Cold resistance"
            value={`${stats.coldRes}%`}
            sub={`(${stats.maxColdRes}% max)`}
          />
          <StatRow
            label="Lightning resistance"
            value={`${stats.lightningRes}%`}
            sub={`(${stats.maxLightningRes}% max)`}
          />
          <StatRow
            label="Chaos resistance"
            value={`${stats.chaosRes}%`}
            sub={`(${stats.maxChaosRes}% max)`}
          />

          <SectionHeader label="Recovery" />
          <StatRow label="Mana regeneration" value={`${stats.manaRegenPerSecond.toFixed(1)}/s`} />
          {lifeOnKill > 0 && (
            <StatRow label="Life recovery on kill" value={lifeOnKill} />
          )}
          {(stats.energyShieldOnHit ?? 0) > 0 && (
            <StatRow label="Energy shield on hit" value={stats.energyShieldOnHit ?? 0} />
          )}
          <StatRow
            label="Post-encounter life"
            value={`+${stats.lifeRecoveryPct.toFixed(1)}%`}
          />
          <StatRow
            label="Post-encounter ES"
            value={`+${stats.esRecoveryPct.toFixed(1)}%`}
          />
        </div>
      </div>
    </div>
  );
}
