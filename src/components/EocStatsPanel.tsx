"use client";

import type { ComputedBuildStats, StatBreakdownBlock, StatBreakdowns } from "../data/gameStats";
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
  type HitDamageScaling,
} from "../data/damageTypes";
import type { HitDamageComputationBreakdown } from "../data/gameStats";

function scalingRuleLabel(s: HitDamageScaling): string {
  switch (s) {
    case "physical_style":
      return "remaining physical: global + attack + melee stack + phys attunement (not elemental Σ)";
    case "native_elemental":
      return "weapon flat element: global + attack + Σ elemental + type-specific (+ fire attune on fire)";
    case "physical_and_elemental":
      return "from physical: phys-style + Σ elemental + type-specific (+ fire attune on fire)";
    case "chaos_style":
      return "attack + chaos-specific (no generic elemental increased)";
    default:
      return s;
  }
}

/** Merged fragments share one rounded range, then the × increased column applies to that range. */
function perFragmentScalingRuleLabel(row: {
  scaling: HitDamageScaling;
  mergedFrom: number;
  mergedScalings: HitDamageScaling[];
}): string {
  const scales = row.mergedScalings.length > 0 ? row.mergedScalings : [row.scaling];
  if (row.mergedFrom > 1) {
    if (scales.length > 1) {
      return scales.map((s) => scalingRuleLabel(s)).join(" · ");
    }
    return `${scalingRuleLabel(row.scaling)} (${row.mergedFrom} summed)`;
  }
  return scalingRuleLabel(row.scaling);
}

function MultiplierBreakdownPanel({ b }: { b: HitDamageComputationBreakdown }) {
  const p = b.physicalConversion;
  return (
    <details className="mt-2 border-t border-zinc-700/60 pt-2">
      <summary className="cursor-pointer text-zinc-400 text-[10px] uppercase tracking-wider select-none hover:text-zinc-300">
        Damage multipliers (sources)
      </summary>
      <div className="mt-2 space-y-3 text-[10px] text-zinc-400 leading-relaxed">
        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Base weapon (before conversion)</div>
          <div className="text-zinc-600 text-[9px] mb-1">
            {b.baseWeaponDamage.includesCharacterBasePhysical
              ? "Physical line: unarmed base + flat."
              : "Physical line: weapon replaces unarmed base."}
          </div>
          {b.abilityDamageMultiplier ? (
            <>
              <div className="text-zinc-500 mb-0.5">Before ability damage mult</div>
              <div className="font-mono text-zinc-300">
                Physical {b.baseWeaponDamage.beforeAbilityDamageMult.physicalMin}–
                {b.baseWeaponDamage.beforeAbilityDamageMult.physicalMax}
              </div>
              {b.baseWeaponDamage.beforeAbilityDamageMult.elemental.map((e) => (
                <div key={`b-${e.type}`} className={`font-mono ${HIT_DAMAGE_TYPE_COLOR_CLASS[e.type]}`}>
                  {HIT_DAMAGE_TYPE_LABEL[e.type]} {e.min}–{e.max}
                </div>
              ))}
              <div className="text-zinc-500 mt-1.5 mb-0.5">
                After ability damage mult (×{b.abilityDamageMultiplier.factor.toFixed(3)})
              </div>
              <div className="font-mono text-zinc-300">
                Physical {b.baseWeaponDamage.afterAbilityDamageMult.physicalMin}–
                {b.baseWeaponDamage.afterAbilityDamageMult.physicalMax}
              </div>
              {b.baseWeaponDamage.afterAbilityDamageMult.elemental.map((e) => (
                <div key={`a-${e.type}`} className={`font-mono ${HIT_DAMAGE_TYPE_COLOR_CLASS[e.type]}`}>
                  {HIT_DAMAGE_TYPE_LABEL[e.type]} {e.min}–{e.max}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="font-mono text-zinc-300">
                Physical {b.baseWeaponDamage.afterAbilityDamageMult.physicalMin}–
                {b.baseWeaponDamage.afterAbilityDamageMult.physicalMax}
              </div>
              {b.baseWeaponDamage.afterAbilityDamageMult.elemental.map((e) => (
                <div key={e.type} className={`font-mono ${HIT_DAMAGE_TYPE_COLOR_CLASS[e.type]}`}>
                  {HIT_DAMAGE_TYPE_LABEL[e.type]} {e.min}–{e.max}
                </div>
              ))}
            </>
          )}
        </div>

        {b.abilityDamageMultiplier && (
          <div>
            <div className="text-zinc-500 font-semibold mb-0.5">Ability damage multiplier</div>
            <div className="font-mono text-zinc-300">
              {b.abilityDamageMultiplier.abilityName} (lv {b.abilityDamageMultiplier.level}):{" "}
              {b.abilityDamageMultiplier.basePct}% base → {b.abilityDamageMultiplier.scaledPct}% scaled → ×
              {b.abilityDamageMultiplier.factor.toFixed(3)} on all hit rows
            </div>
          </div>
        )}

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Physical → elemental (gear + ability lines)</div>
          <div className="font-mono">
            Gear: {p.gearPct.fire}% fire, {p.gearPct.cold}% cold, {p.gearPct.lightning}% lightning
          </div>
          <div className="font-mono">
            Ability: {p.abilityPct.fire}% fire, {p.abilityPct.cold}% cold, {p.abilityPct.lightning}% lightning
          </div>
          <div className="font-mono">
            Combined raw: {p.combinedRawPct.fire}% / {p.combinedRawPct.cold}% / {p.combinedRawPct.lightning}% (sum{" "}
            {p.rawTotalPercent.toFixed(1)}%)
          </div>
          {p.cappedAt100Percent && (
            <div className="text-amber-400/90 mt-0.5">
              Capped at 100% total conversion — normalization ×{p.normalizationFactor.toFixed(4)} → effective{" "}
              {p.effectivePercent.fire.toFixed(2)}% / {p.effectivePercent.cold.toFixed(2)}% /{" "}
              {p.effectivePercent.lightning.toFixed(2)}%
            </div>
          )}
        </div>

        {b.laterConversions.length > 0 && (
          <div>
            <div className="text-zinc-500 font-semibold mb-0.5">Further conversion</div>
            <ul className="list-disc pl-4 space-y-0.5 font-mono">
              {b.laterConversions.map((x, i) => (
                <li key={i}>
                  {x.name}
                  {x.percent != null ? ` (${x.percent}%)` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Increased damage pools (additive)</div>
          <div className="text-zinc-500 mb-0.5">Attack + generic (Σ = {b.increased.attackIncSum.total.toFixed(1)}%)</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {b.increased.attackIncSum.lines.map((l, i) => (
              <li key={i} className="font-mono">
                {l.label}: {l.value >= 0 ? "+" : ""}
                {l.value.toFixed(1)}%
              </li>
            ))}
          </ul>
          <div className="text-zinc-500 mt-1 mb-0.5">
            Phys-style total (Σ = {b.increased.physStyleIncTotal.total.toFixed(1)}%) — attack + generic stack + phys
            attunement; used for remaining physical (not elemental Σ alone)
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {b.increased.physStyleIncTotal.lines.map((l, i) => (
              <li key={i} className="font-mono">
                {l.label}: {l.value >= 0 ? "+" : ""}
                {l.value.toFixed(1)}%
              </li>
            ))}
          </ul>
          <div className="text-zinc-500 mt-1 mb-0.5">
            Elemental increased (Σ = {b.increased.elemental.total.toFixed(1)}%)
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {b.increased.elemental.lines.map((l, i) => (
              <li key={i} className="font-mono">
                {l.label}: {l.value >= 0 ? "+" : ""}
                {l.value.toFixed(1)}%
              </li>
            ))}
          </ul>
          <div className="mt-1 font-mono text-zinc-300">
            Type-specific gear: fire {b.increased.typeSpecificGear.fire.toFixed(1)}%, cold{" "}
            {b.increased.typeSpecificGear.cold.toFixed(1)}%, lightning {b.increased.typeSpecificGear.lightning.toFixed(1)}
            %, chaos {b.increased.typeSpecificGear.chaos.toFixed(1)}%
          </div>
          {b.increased.attunementFire !== 0 && (
            <div className="mt-0.5 font-mono">Fire attunement: +{b.increased.attunementFire.toFixed(1)}% (fire rows)</div>
          )}
        </div>

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Per fragment (before → after increased)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[9px]">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-700">
                  <th className="py-0.5 pr-1">Type</th>
                  <th className="py-0.5 pr-1">Rule</th>
                  <th className="py-0.5 pr-1">Range before</th>
                  <th className="py-0.5 pr-1">Σ increased</th>
                  <th className="py-0.5 pr-1">×</th>
                  <th className="py-0.5">After Σ increased</th>
                </tr>
              </thead>
              <tbody>
                {b.perInstanceBeforeIncreased.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/80">
                    <td className={`py-0.5 pr-1 ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}>
                      {HIT_DAMAGE_TYPE_LABEL[row.type]}
                    </td>
                    <td className="py-0.5 pr-1 text-zinc-500 max-w-[180px]">{perFragmentScalingRuleLabel(row)}</td>
                    <td className="py-0.5 pr-1 font-mono text-zinc-300">
                      {Math.round(row.min)}–{Math.round(row.max)}
                    </td>
                    <td className="py-0.5 pr-1 font-mono">+{row.increasedDamagePercent.toFixed(1)}%</td>
                    <td className="py-0.5 pr-1 font-mono">×{row.damageMultiplier.toFixed(3)}</td>
                    <td className="py-0.5 font-mono text-zinc-300">
                      {Math.round(row.min * row.damageMultiplier)}–
                      {Math.round(row.max * row.damageMultiplier)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">After increased (collapsed by type)</div>
          <div className="font-mono space-y-0.5">
            {b.collapsedAfterIncreased.map((r) => (
              <div key={r.type} className={HIT_DAMAGE_TYPE_COLOR_CLASS[r.type]}>
                {HIT_DAMAGE_TYPE_LABEL[r.type]} {r.min}–{r.max}
              </div>
            ))}
          </div>
          <div className="mt-1 text-zinc-300 font-mono">Average hit: {b.avgHit.toFixed(1)}</div>
        </div>

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Critical strikes (expected)</div>
          <div className="font-mono space-y-0.5">
            <div>
              Crit chance {b.critical.critChance.toFixed(1)}%, multiplier ×{b.critical.critMultiplier.toFixed(2)}
            </div>
            <div>
              Effective damage vs non-crit: ×{b.critical.effectiveDamageMultiplier.toFixed(4)} (= 1 + critChance ×
              (M−1))
            </div>
          </div>
        </div>

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">DPS</div>
          <div className="font-mono text-zinc-300">
            {b.dps.value.toFixed(1)} = {b.dps.avgEffectiveDamage.toFixed(1)} × {b.dps.attacksPerSecond.toFixed(2)} APS ×{" "}
            {b.dps.strikesPerAttack} strike(s)
          </div>
          <div className="text-zinc-500 mt-1 mb-0.5">Increased attack speed (additive)</div>
          <ul className="list-disc pl-4 font-mono space-y-0.5">
            {b.dps.apsContributions.map((l, i) => (
              <li key={i}>
                {l.label}: +{l.value.toFixed(1)}%
              </li>
            ))}
          </ul>
          <div className="text-zinc-500 mt-1 mb-0.5">Multiplicative APS</div>
          <ul className="list-disc pl-4 font-mono space-y-0.5">
            {b.dps.apsMoreMultipliers.map((m, i) => (
              <li key={i}>
                {m.label}: ×{m.factor.toFixed(3)}
              </li>
            ))}
          </ul>
          {b.dps.strikesContributions.length > 0 && (
            <>
              <div className="text-zinc-500 mt-1 mb-0.5">Strikes per attack</div>
              <ul className="list-disc pl-4 font-mono space-y-0.5">
                {b.dps.strikesContributions.map((l, i) => (
                  <li key={i}>
                    {l.label}: {l.value >= 0 ? "+" : ""}
                    {typeof l.value === "number" && l.value % 1 !== 0 ? l.value.toFixed(2) : l.value}
                  </li>
                ))}
              </ul>
            </>
          )}
          {b.dps.notes.map((n, i) => (
            <p key={i} className="mt-1 text-zinc-500 italic">
              {n}
            </p>
          ))}
        </div>

        {b.enemiesTakeIncreasedDamage.totalPercent !== 0 && (
          <div>
            <div className="text-zinc-500 font-semibold mb-0.5">Enemies take increased damage</div>
            <div className="font-mono text-zinc-300 space-y-0.5">
              {b.enemiesTakeIncreasedDamage.gearPercent !== 0 && (
                <div>Gear: +{b.enemiesTakeIncreasedDamage.gearPercent.toFixed(1)}%</div>
              )}
              {b.enemiesTakeIncreasedDamage.tricksterPercent !== 0 && (
                <div>Trickster (class bonus): +{b.enemiesTakeIncreasedDamage.tricksterPercent.toFixed(1)}%</div>
              )}
              <div>
                Total +{b.enemiesTakeIncreasedDamage.totalPercent.toFixed(1)}% → ×
                {b.enemiesTakeIncreasedDamage.multiplier.toFixed(4)} on hit range and DPS (after increased mods)
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="text-zinc-500 font-semibold mb-0.5">Combat-only (not in planner hit / DPS above)</div>
          <div className="font-mono">
            Gear less damage dealt: ×{b.combatOnlyNotInPlannerHitOrDps.damageDealtLessMult.toFixed(3)}
          </div>
        </div>
      </div>
    </details>
  );
}

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

function formatBreakdownValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);
}

function BreakdownStatRow({
  label,
  value,
  sub,
  breakdown,
}: {
  label: string;
  value: string | number;
  sub?: string;
  breakdown: StatBreakdownBlock;
}) {
  const hasDetail = Boolean(breakdown.formula?.length) || breakdown.lines.length > 0;
  if (!hasDetail) {
    return <StatRow label={label} value={value} sub={sub} />;
  }
  return (
    <details className="py-0.5 rounded open:bg-zinc-800/30">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 text-xs [&::-webkit-details-marker]:hidden">
        <span className="text-zinc-400">{label}</span>
        <span className="shrink-0 text-right font-mono text-zinc-100">
          {value}
          {sub && <span className="ml-1 text-zinc-500">{sub}</span>}
          <span className="ml-1 text-[9px] text-zinc-600">▾</span>
        </span>
      </summary>
      {breakdown.formula && (
        <p className="mt-1 border-l border-zinc-700 pl-2 text-[10px] italic leading-snug text-zinc-500">
          {breakdown.formula}
        </p>
      )}
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-relaxed text-zinc-400">
        {breakdown.lines.map((l, i) => (
          <li key={i}>
            <span className="text-zinc-500">{l.label}: </span>
            <span className="font-mono text-zinc-300">{formatBreakdownValue(l.value)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function prettyStatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
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
  const shockDuration = BASE_SHOCK_CHILL_DURATION_SEC * stats.ailmentDurationMultiplier;

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

  const sb = stats.statBreakdowns;

  const shockChanceBreak: StatBreakdownBlock = {
    formula: `min(100, elemental ailment chance + shock inflict bonus) = ${shockChance.toFixed(0)}%`,
    lines: [
      ...stats.statBreakdowns.elementalAilmentChance.lines.map((l) => ({
        ...l,
        label: `Elemental ailment: ${l.label}`,
      })),
      ...stats.statBreakdowns.shockInflictChanceBonus.lines.map((l) => ({
        ...l,
        label: `Shock bonus: ${l.label}`,
      })),
    ],
  };

  const lifeOnKillBreak: StatBreakdownBlock = {
    formula: `flat on kill + max life × (recovered % / 100) = ${lifeOnKill}`,
    lines: [
      ...sb.flatLifeOnKill.lines.map((l) => ({ ...l, label: `Flat: ${l.label}` })),
      ...sb.lifeRecoveredOnKillPercent.lines.map((l) => ({ ...l, label: `% of max life: ${l.label}` })),
    ],
  };

  const allStatKeys = Object.keys(sb).sort() as (keyof StatBreakdowns)[];

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
        {byType.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {byType.map((row) => (
              <div
                key={row.type}
                className={`text-sm font-bold font-mono ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}
              >
                {HIT_DAMAGE_TYPE_LABEL[row.type]} {row.min}–{row.max}
              </div>
            ))}
            {byType.length > 1 && (
              <div className="text-zinc-400 text-xs font-mono border-t border-zinc-700/60 pt-0.5 mt-0.5">
                Total {stats.hitDamageMin}–{stats.hitDamageMax}
              </div>
            )}
          </div>
        ) : (
          <span className="text-lg font-bold font-mono text-stone-300">
            {stats.hitDamageMin}–{stats.hitDamageMax}
          </span>
        )}
        {stats.hitDamageComputationBreakdown && (
          <MultiplierBreakdownPanel b={stats.hitDamageComputationBreakdown} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        {/* ── Left column ── */}
        <div>
          <SectionHeader label="Offensive" />
          <BreakdownStatRow
            label="Attacks per second"
            value={`${stats.aps.toFixed(2)}`}
            sub={`(${stats.strikesPerAttack} hits/atk)`}
            breakdown={sb.aps}
          />
          <BreakdownStatRow
            label="DPS"
            value={stats.dps.toFixed(1)}
            sub={`avg hit ${stats.avgEffectiveDamage.toFixed(1)}`}
            breakdown={sb.dps}
          />
          <BreakdownStatRow
            label="Mana cost"
            value={stats.manaCostPerAttack.toFixed(0)}
            breakdown={sb.manaCostPerAttack}
          />
          <BreakdownStatRow
            label="Accuracy rating"
            value={stats.accuracy}
            sub={`(${hitChanceVsEnemy.toFixed(0)}% hit)`}
            breakdown={sb.accuracy}
          />
          <BreakdownStatRow
            label="Critical hit chance"
            value={`${stats.critChance.toFixed(1)}%`}
            breakdown={sb.critChance}
          />
          <BreakdownStatRow
            label="Critical damage multiplier"
            value={`+${critBonusPct}%`}
            breakdown={sb.critMultiplier}
          />

          {shockChance > 0 && (
            <>
              <SectionHeader label="Shock" />
              <BreakdownStatRow
                label="Chance to inflict shock"
                value={`${shockChance.toFixed(0)}%`}
                breakdown={shockChanceBreak}
              />
              {shockEffectInc > 0 && (
                <BreakdownStatRow
                  label="Increased effect"
                  value={`${shockEffectInc.toFixed(0)}%`}
                  breakdown={sb.nonDamagingAilmentEffectIncreasedPercent}
                />
              )}
              <BreakdownStatRow
                label="Duration"
                value={`${shockDuration.toFixed(2)}s`}
                breakdown={sb.ailmentDurationBonus}
              />
              <StatRow
                label="Effect preview"
                value={`${Math.min(50, shockEffectPreview).toFixed(1)}%`}
                sub="inc dmg taken"
              />
            </>
          )}

          <SectionHeader label="Attributes" />
          <BreakdownStatRow label="Strength" value={stats.str} breakdown={sb.str} />
          <BreakdownStatRow label="Dexterity" value={stats.dex} breakdown={sb.dex} />
          <BreakdownStatRow label="Intelligence" value={stats.int} breakdown={sb.int} />
        </div>

        {/* ── Right column ── */}
        <div>
          <SectionHeader label="Defensive" />
          <BreakdownStatRow
            label="Armour"
            value={stats.armour}
            sub={`(${drPhys.toFixed(0)}% phys, ${drEle.toFixed(0)}% ele, ${drChaos.toFixed(0)}% chaos)`}
            breakdown={sb.armour}
          />
          <BreakdownStatRow
            label="Evasion rating"
            value={stats.evasionRating}
            sub={`(${evasionVsAttacks.toFixed(0)}% atk, ${evasionVsSpells.toFixed(0)}% spell)`}
            breakdown={sb.evasionRating}
          />
          <BreakdownStatRow label="Energy shield" value={stats.maxEnergyShield} breakdown={sb.maxEnergyShield} />
          <BreakdownStatRow label="Life" value={stats.maxLife} breakdown={sb.maxLife} />
          <BreakdownStatRow label="Mana" value={stats.maxMana} breakdown={sb.maxMana} />
          <BreakdownStatRow label="Chance to dodge" value={`${stats.dodgeChance.toFixed(0)}%`} breakdown={sb.dodgeChance} />
          {stats.blockChance > 0 && (
            <BreakdownStatRow
              label="Chance to block"
              value={`${stats.blockChance.toFixed(0)}%`}
              breakdown={sb.blockChance}
            />
          )}
          {(stats.reducedPhysicalDamageTaken ?? 0) > 0 && (
            <BreakdownStatRow
              label="Reduced physical damage taken"
              value={(stats.reducedPhysicalDamageTaken ?? 0).toFixed(0)}
              breakdown={sb.reducedPhysicalDamageTaken}
            />
          )}

          <SectionHeader label="Resistances" />
          <BreakdownStatRow
            label="Fire resistance"
            value={`${stats.fireRes > stats.maxFireRes ? stats.maxFireRes : stats.fireRes}%`}
            sub={stats.fireRes > stats.maxFireRes ? `(${stats.fireRes}%)` : undefined}
            breakdown={sb.fireRes}
          />
          <BreakdownStatRow
            label="Cold resistance"
            value={`${stats.coldRes > stats.maxColdRes ? stats.maxColdRes : stats.coldRes}%`}
            sub={stats.coldRes > stats.maxColdRes ? `(${stats.coldRes}%)` : undefined}
            breakdown={sb.coldRes}
          />
          <BreakdownStatRow
            label="Lightning resistance"
            value={`${stats.lightningRes > stats.maxLightningRes ? stats.maxLightningRes : stats.lightningRes}%`}
            sub={stats.lightningRes > stats.maxLightningRes ? `(${stats.lightningRes}%)` : undefined}
            breakdown={sb.lightningRes}
          />
          <BreakdownStatRow
            label="Chaos resistance"
            value={`${stats.chaosRes > stats.maxChaosRes ? stats.maxChaosRes : stats.chaosRes}%`}
            sub={stats.chaosRes > stats.maxChaosRes ? `(${stats.chaosRes}%)` : undefined}
            breakdown={sb.chaosRes}
          />

          <SectionHeader label="Recovery" />
          <BreakdownStatRow
            label="Mana regeneration"
            value={`${stats.manaRegenPerSecond.toFixed(1)}/s`}
            breakdown={sb.manaRegenPerSecond}
          />
          {lifeOnKill > 0 && (
            <BreakdownStatRow label="Life recovery on kill" value={lifeOnKill} breakdown={lifeOnKillBreak} />
          )}
          {(stats.energyShieldOnHit ?? 0) > 0 && (
            <BreakdownStatRow
              label="Energy shield on hit"
              value={stats.energyShieldOnHit ?? 0}
              breakdown={sb.energyShieldOnHit}
            />
          )}
          <BreakdownStatRow
            label="Post-encounter life"
            value={`+${stats.lifeRecoveryPct.toFixed(1)}%`}
            breakdown={sb.lifeRecoveryPct}
          />
          <BreakdownStatRow
            label="Post-encounter ES"
            value={`+${stats.esRecoveryPct.toFixed(1)}%`}
            breakdown={sb.esRecoveryPct}
          />
        </div>
      </div>

      <details className="mt-4 border border-zinc-800 rounded-lg p-3">
        <summary className="cursor-pointer text-zinc-400 text-[10px] uppercase tracking-wider select-none hover:text-zinc-300">
          Every stat — full source list ({allStatKeys.length})
        </summary>
        <div className="mt-3 max-h-[min(70vh,560px)] overflow-y-auto space-y-3 pr-1">
          {allStatKeys.map((key) => {
            const b = sb[key];
            return (
              <div key={key} className="border-b border-zinc-800/80 pb-2 last:border-0">
                <div className="text-zinc-300 text-xs font-medium mb-1">{prettyStatKey(key)}</div>
                {b.formula && (
                  <p className="text-[10px] text-zinc-500 italic mb-1">{b.formula}</p>
                )}
                <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-zinc-400">
                  {b.lines.map((l, i) => (
                    <li key={i}>
                      <span className="text-zinc-500">{l.label}: </span>
                      <span className="font-mono text-zinc-300">{formatBreakdownValue(l.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
