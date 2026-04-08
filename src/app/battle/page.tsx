"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { simulateEncounter } from "../../battle/engine";
import type { DemoEnemyDef } from "../../battle/types";
import {
  applyEnemyModifierBaseRatiosToScaledEnemy,
  ENEMY_MODIFIER_ORDER,
  MAX_ENEMY_MODIFIERS,
  enemyModifierDescription,
  enemyModifierLabel,
  type EnemyModifierId,
} from "../../data/enemyModifiers";
import { enemyStatsAtLevel } from "../../data/formulaConstants";
import { FORMULA_CONSTANTS } from "../../data/formulaConstants";
import {
  getCrucibleTierRow,
  getNexusTierRow,
} from "../../data/nexusEnemyScaling";
import {
  HIT_DAMAGE_TYPE_COLOR_CLASS,
  HIT_DAMAGE_TYPE_LABEL,
} from "../../data/damageTypes";
import { getEquippedEntry, migrateEquippedFromSave } from "../../data/equipment";
import { computeBuildStats, emptyEquipmentModifiers } from "../../data/gameStats";
import { loadBuildsState, type StoredPlannerPayload } from "../../lib/eocBuildStorage";

type EnemyModSlot = { id: EnemyModifierId | null; tier: 1 | 2 | 3 };
type EnemyRarity = "normal" | "elite" | "boss";
type EnemyScalingMode = "level" | "nexus" | "crucible";

export default function BattleDemoPage() {
  const [runKey, setRunKey] = useState(0);
  const [plannerSnapshot, setPlannerSnapshot] = useState<StoredPlannerPayload | null>(null);
  const [activeBuildName, setActiveBuildName] = useState<string | null>(null);
  const [enemyModSlots, setEnemyModSlots] = useState<EnemyModSlot[]>(
    () => Array.from({ length: MAX_ENEMY_MODIFIERS }, () => ({ id: null, tier: 1 }))
  );
  const [enemyMode, setEnemyMode] = useState<EnemyScalingMode>("level");
  const [enemyLevel, setEnemyLevel] = useState<number>(100);
  const [enemyZone, setEnemyZone] = useState<number>(1);
  const [enemyRarity, setEnemyRarity] = useState<EnemyRarity>("normal");
  const [nexusTier, setNexusTier] = useState<number>(0);
  const [crucibleTier, setCrucibleTier] = useState<number>(0);

  function loadActiveBuild(): { name: string | null; payload: StoredPlannerPayload | null } {
    const state = loadBuildsState();
    const active = state.builds.find((b) => b.id === state.activeBuildId) ?? state.builds[0];
    return { name: active?.name ?? null, payload: active?.payload ?? null };
  }

  useEffect(() => {
    queueMicrotask(() => {
      const { name, payload } = loadActiveBuild();
      setActiveBuildName(name);
      setPlannerSnapshot(payload);
    });
  }, []);

  const activeConfig = useMemo(() => {
    if (plannerSnapshot) {
      const equippedMap = migrateEquippedFromSave(plannerSnapshot.equipped ?? null);
      const weaponItemId = getEquippedEntry(equippedMap, "Weapon").itemId;
      return {
        upgradeLevels: plannerSnapshot.upgradeLevels,
        equipmentModifiers: plannerSnapshot.equipmentModifiers,
        equippedWeaponItemId: weaponItemId,
        ability: plannerSnapshot.ability ?? null,
        equipped: equippedMap,
      };
    }
    return { upgradeLevels: {}, equipmentModifiers: emptyEquipmentModifiers() };
  }, [plannerSnapshot]);

  const stats = useMemo(() => computeBuildStats(activeConfig), [activeConfig]);

  const derivedEnemy = useMemo((): DemoEnemyDef => {
    const C = FORMULA_CONSTANTS;
    const rarityLifeMult = enemyRarity === "elite" ? C.eliteLifeMult : enemyRarity === "boss" ? C.bossLifeMult : 1;
    const rarityDmgMult = enemyRarity === "elite" ? C.eliteDamageMult : enemyRarity === "boss" ? C.bossDamageMult : 1;
    const rarityRegenMult = enemyRarity === "elite" ? C.eliteRegenMult : enemyRarity === "boss" ? C.bossRegenMult : 1;

    const zone = Math.max(1, Math.floor(enemyZone || 1));

    if (enemyMode === "nexus" || enemyMode === "crucible") {
      const row = enemyMode === "nexus" ? getNexusTierRow(Math.max(0, Math.floor(nexusTier))) : getCrucibleTierRow(Math.max(0, Math.floor(crucibleTier)));
      const tLabel = enemyMode === "nexus" ? `Nexus ${Math.max(0, Math.floor(nexusTier))}` : `Crucible ${Math.max(0, Math.floor(crucibleTier))}`;
      if (!row) {
        return {
          id: "enemy",
          name: `${tLabel} (missing data)`,
          maxLife: 1,
          armour: 0,
          evasionRating: 0,
          accuracy: 0,
          damageMin: 0,
          damageMax: 0,
          aps: 0.95,
          zone,
        };
      }
      return {
        id: "enemy",
        name: `${tLabel}${enemyRarity !== "normal" ? ` (${enemyRarity})` : ""}`,
        maxLife: Math.max(1, Math.round(row.health * rarityLifeMult)),
        maxEnergyShield: 0,
        rarityLifeMult,
        rarityRegenMult,
        // For Nexus/Crucible, tier rows already represent the fully scaled stats from formulas.csv.
        // Flat mods (Vital/Plated/…) are defined as "+Δ to CSV base (40 life, 1 armour, …) before scaling",
        // so we intentionally omit `modifierRatioBases` here to fall back to those CSV denominators.
        armour: Math.max(0, Math.round(row.armour)),
        evasionRating: Math.max(0, Math.round(row.evasion)),
        accuracy: Math.max(0, Math.round(row.accuracy)),
        damageMin: Math.max(0, Math.round(row.physMin * rarityDmgMult)),
        damageMax: Math.max(0, Math.round(row.physMax * rarityDmgMult)),
        physicalDamageMin: Math.max(0, Math.round(row.physMin * rarityDmgMult)),
        physicalDamageMax: Math.max(0, Math.round(row.physMax * rarityDmgMult)),
        elementalDamageMin: Math.max(0, Math.round(row.elementalMin * rarityDmgMult)),
        elementalDamageMax: Math.max(0, Math.round(row.elementalMax * rarityDmgMult)),
        chaosDamageMin: Math.max(0, Math.round(row.chaosMin * rarityDmgMult)),
        chaosDamageMax: Math.max(0, Math.round(row.chaosMax * rarityDmgMult)),
        aps: Math.max(0.05, row.attacksPerSecond),
        fireResistancePercent: row.elementalResPercent,
        coldResistancePercent: row.elementalResPercent,
        lightningResistancePercent: row.elementalResPercent,
        chaosResistancePercent: row.chaosResPercent,
        zone,
      };
    }

    const lvl = Math.max(1, Math.floor(enemyLevel || 1));
    const base = enemyStatsAtLevel(lvl);
    return {
      id: "enemy",
      name: `Enemy L${lvl}${enemyRarity !== "normal" ? ` (${enemyRarity})` : ""}`,
      maxLife: Math.max(1, Math.round(base.life * rarityLifeMult)),
      rarityLifeMult,
      rarityRegenMult,
      // Level stats are already fully scaled from formulas.csv bases.
      // Flat enemy mods (Vital/Plated/…) are defined as "+Δ to CSV base (40 life, 1 armour, …) before scaling",
      // so we omit `modifierRatioBases` to use those CSV denominators for correct scaling at any level.
      armour: Math.max(0, Math.round(base.armour)),
      evasionRating: Math.max(0, Math.round(base.evasion)),
      accuracy: Math.max(0, Math.round(base.accuracy)),
      damageMin: Math.max(0, Math.round(base.damageMin * rarityDmgMult)),
      damageMax: Math.max(0, Math.round(base.damageMax * rarityDmgMult)),
      aps: Math.max(0.05, Number(base.speed.toFixed(3))),
      zone,
    };
  }, [enemyMode, enemyLevel, enemyZone, enemyRarity, nexusTier, crucibleTier]);

  const enemyWithMods = useMemo(() => {
    const mods = enemyModSlots
      .filter((s): s is { id: EnemyModifierId; tier: 1 | 2 | 3 } => Boolean(s.id))
      .map((s) => ({ id: s.id!, tier: s.tier }));
    return applyEnemyModifierBaseRatiosToScaledEnemy(derivedEnemy, mods);
  }, [derivedEnemy, enemyModSlots]);

  const result = useMemo(() => {
    void runKey;
    return simulateEncounter({
      stats,
      enemy: derivedEnemy,
      enemyModsWithTiers: enemyModSlots
        .filter((s): s is { id: EnemyModifierId; tier: 1 | 2 | 3 } => Boolean(s.id))
        .map((s) => ({ id: s.id!, tier: s.tier })),
      options: { maxDurationSeconds: 90, maxLogEntries: 100, dt: 0.05 },
    });
  }, [stats, derivedEnemy, enemyModSlots, runKey]);

  const encounterSummary = useMemo(() => {
    const duration = Math.max(1e-6, result.durationSeconds)
    const lifeDamageDone = Math.max(0, derivedEnemy.maxLife - result.enemyLifeFinal)
    const dpsAvg = lifeDamageDone / duration

    // Damage "heat" scaling for log coloring — computed per encounter.
    const maxByKind = { player_attack: 0, enemy_attack: 0, ailment: 0, dot_tick: 0, phase: 0 } as const
    const maxDamage = { ...maxByKind } as Record<keyof typeof maxByKind, number>
    for (const line of result.log) {
      const d = line.damage ?? 0
      if (d > (maxDamage[line.kind] ?? 0)) maxDamage[line.kind] = d
    }

    return { dpsAvg, lifeDamageDone, maxDamage }
  }, [result, derivedEnemy.maxLife]);

  const selectedEnemyModIds = useMemo(() => {
    return new Set(enemyModSlots.map((s) => s.id).filter(Boolean) as EnemyModifierId[]);
  }, [enemyModSlots]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold">Demo encounter</h1>
            <p className="text-zinc-500 text-xs">
              Uses your currently selected planner build
              {activeBuildName ? (
                <>
                  {" "}
                  (<code className="text-zinc-400">{activeBuildName}</code>)
                </>
              ) : (
                ""
              )}{" "}
              vs. an enemy scaled by formulas (level/tier + modifiers).
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                const { name, payload } = loadActiveBuild();
                setActiveBuildName(name);
                setPlannerSnapshot(payload);
              }}
            >
              Reload active build
            </button>
            <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
              ← Build planner
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!plannerSnapshot && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            No saved build found. Go to the build planner and configure your build first.
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-3">
            Enemy modifiers (max {MAX_ENEMY_MODIFIERS})
          </div>
          <div className="space-y-2">
            {enemyModSlots.map((slot, idx) => {
              const inOtherSlots = new Set(selectedEnemyModIds);
              if (slot.id) inOtherSlots.delete(slot.id);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <label className="col-span-8 space-y-1">
                    <span className="text-zinc-500 text-xs">Modifier {idx + 1}</span>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                      value={slot.id ?? ""}
                      onChange={(e) => {
                        const next = (e.target.value || null) as EnemyModifierId | null;
                        setEnemyModSlots((prev) => {
                          const out = prev.map((s) => ({ ...s }));
                          out[idx] = { ...out[idx], id: next };
                          // Enforce distinct modifier types.
                          if (next) {
                            for (let j = 0; j < out.length; j++) {
                              if (j !== idx && out[j].id === next) out[j].id = null;
                            }
                          }
                          return out;
                        });
                      }}
                    >
                      <option value="">— none —</option>
                      {ENEMY_MODIFIER_ORDER.map((id) => (
                        <option key={id} value={id} disabled={inOtherSlots.has(id)}>
                          {enemyModifierLabel(id)}
                        </option>
                      ))}
                    </select>
                    {slot.id && (
                      <div className="text-[10px] text-zinc-500">
                        {enemyModifierDescription(slot.id)}
                      </div>
                    )}
                  </label>

                  <label className="col-span-3 space-y-1">
                    <span className="text-zinc-500 text-xs">Tier</span>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                      value={slot.tier}
                      disabled={!slot.id}
                      onChange={(e) => {
                        const tier = (Number(e.target.value) || 1) as 1 | 2 | 3;
                        setEnemyModSlots((prev) => {
                          const out = prev.map((s) => ({ ...s }));
                          out[idx] = { ...out[idx], tier: tier === 2 || tier === 3 ? tier : 1 };
                          return out;
                        });
                      }}
                    >
                      <option value={1}>I</option>
                      <option value={2}>II</option>
                      <option value={3}>III</option>
                    </select>
                  </label>

                  <div className="col-span-1 pt-6">
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-200"
                      onClick={() =>
                        setEnemyModSlots((prev) => {
                          const out = prev.map((s) => ({ ...s }));
                          out[idx] = { id: null, tier: 1 };
                          return out;
                        })
                      }
                      title="Clear"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-200"
              onClick={() =>
                setEnemyModSlots(Array.from({ length: MAX_ENEMY_MODIFIERS }, () => ({ id: null, tier: 1 })))
              }
            >
              Clear all
            </button>
            <span className="text-[10px] text-zinc-600">
              Mods add to formula enemy bases (life 40, armour 1, …) before scaling; tier multiplies those
              flat values. Powerful/Weak use per-tier exponents.
            </span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Enemy scaling (formulas)</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Mode</span>
              <select
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                value={enemyMode}
                onChange={(e) => setEnemyMode(e.target.value as EnemyScalingMode)}
              >
                <option value="level">Level scaling</option>
                <option value="nexus">Nexus tier</option>
                <option value="crucible">Crucible tier</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Rarity</span>
              <select
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                value={enemyRarity}
                onChange={(e) => setEnemyRarity(e.target.value as EnemyRarity)}
              >
                <option value="normal">Normal</option>
                <option value="elite">Elite</option>
                <option value="boss">Boss</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Zone (res scaling)</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyZone}
                onChange={(e) =>
                  setEnemyZone(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                }
              />
            </label>

            {enemyMode === "level" ? (
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Enemy level</span>
                <input
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                  value={enemyLevel}
                  onChange={(e) =>
                    setEnemyLevel(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))
                  }
                />
              </label>
            ) : enemyMode === "nexus" ? (
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Nexus tier</span>
                <input
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                  value={nexusTier}
                  onChange={(e) => setNexusTier(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </label>
            ) : (
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Crucible tier</span>
                <input
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                  value={crucibleTier}
                  onChange={(e) => setCrucibleTier(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </label>
            )}

            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Derived (with mods)</span>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400">
                {enemyWithMods.name}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Life / ES / Armour</span>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400 font-mono">
                {enemyWithMods.maxLife} / {enemyWithMods.maxEnergyShield ?? 0} / {enemyWithMods.armour}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Acc / Eva</span>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400 font-mono">
                {enemyWithMods.accuracy} / {enemyWithMods.evasionRating}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Damage / APS</span>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400 font-mono">
                {enemyWithMods.damageMin}–{enemyWithMods.damageMax} · {enemyWithMods.aps.toFixed(3)}/s
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Res (fire/cold/light/chaos)</span>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400 font-mono">
                {(enemyWithMods.fireResistancePercent ?? 0).toFixed(0)}/
                {(enemyWithMods.coldResistancePercent ?? 0).toFixed(0)}/
                {(enemyWithMods.lightningResistancePercent ?? 0).toFixed(0)}/
                {(enemyWithMods.chaosResistancePercent ?? 0).toFixed(0)}
              </div>
            </label>

            {/* Legacy manual stat inputs removed intentionally (enemy is derived from formulas). */}
            {false && (
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Armour</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={0}
                onChange={() => {}}
              />
              </label>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRunKey((k) => k + 1)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          Run again (new random rolls)
        </button>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-1">
            <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Your stats</div>
            <div>
              Life {stats.maxLife} · ES {stats.maxEnergyShield} · Mana {stats.maxMana}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-zinc-500 shrink-0">Hit</span>
              {stats.hitDamageByType.map((row) => (
                <span
                  key={row.type}
                  className={`font-mono font-medium ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}
                >
                  {HIT_DAMAGE_TYPE_LABEL[row.type]}{" "}
                  {row.min}–{row.max}
                </span>
              ))}
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-300">
                {stats.aps.toFixed(2)}{" "}
                {stats.abilityContribution?.type === "Spells" ? "casts/s" : "atk/s"}
              </span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-300">{stats.critChance.toFixed(1)}% crit</span>
              {stats.abilityContribution?.type !== "Spells" && (
                <>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-300">{stats.strikesPerAttack} strike(s)/atk</span>
                </>
              )}
            </div>
            <div>
              Armour {stats.armour} · Evasion {stats.evasionRating}
            </div>
            <div>
              Block {stats.blockChance}% · Dodge {stats.dodgeChance}% · Acc {stats.accuracy}
            </div>
            <div>DPS (sheet avg) {stats.dps.toFixed(1)}</div>
            <div className="text-zinc-500 text-xs pt-1 border-t border-zinc-800 mt-2">
              Demo ailments (tree + ability lines): bleed {stats.bleedChance.toFixed(0)}% · poison{" "}
              {stats.poisonChance.toFixed(0)}% · elemental {stats.elementalAilmentChance.toFixed(0)}% (adds to fire/cold/lightning
              rolls) · shock +{stats.shockInflictChanceBonus.toFixed(0)}% · chill +{stats.chillInflictChanceBonus.toFixed(0)}% ·
              ignite +{stats.igniteInflictChanceBonus.toFixed(0)}% · DoT mult {stats.damageOverTimeMultiplier.toFixed(0)}% ·
              dur ×{stats.ailmentDurationMultiplier.toFixed(2)} (ignite ×{stats.igniteAilmentDurationMultiplier.toFixed(2)}) · Σ%{" "}
              {stats.ailmentDurationBonus.toFixed(0)}
            </div>
            {stats.classBonusesActive.length > 0 && (
              <div className="text-zinc-500 text-xs pt-2">
                Active bonuses: {stats.classBonusesActive.join(", ")}
              </div>
            )}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-1">
            <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Enemy (active)</div>
            <div>
              {derivedEnemy.name}: {derivedEnemy.maxLife} life · {derivedEnemy.aps} atk/s
            </div>
            {(enemyModSlots.some((s) => s.id) ?? false) && (
              <div className="text-zinc-500 text-xs">
                Mods:{" "}
                {(enemyModSlots
                  .filter((s) => s.id)
                  .map((s) => `${enemyModifierLabel(s.id!)} ${s.tier === 1 ? "I" : s.tier === 2 ? "II" : "III"}`)
                  .join(", ")) || "—"}
              </div>
            )}
            <div>
              Dmg {derivedEnemy.damageMin}–{derivedEnemy.damageMax} · acc {derivedEnemy.accuracy} · eva{" "}
              {derivedEnemy.evasionRating} · arm {derivedEnemy.armour}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span
              className={`text-lg font-semibold ${
                result.winner === "player"
                  ? "text-emerald-400"
                  : result.winner === "enemy"
                    ? "text-red-400"
                    : "text-amber-400"
              }`}
            >
              {result.winner === "player"
                ? "Victory"
                : result.winner === "enemy"
                  ? "Defeat"
                  : "Timeout"}
            </span>
            <span className="text-zinc-500 text-sm">
              {result.durationSeconds.toFixed(1)}s · you landed {result.hitsLandedPlayer} hits · took{" "}
              {result.hitsLandedEnemy} hits
              {" "}
              · DPS avg <span className="text-zinc-300">{encounterSummary.dpsAvg.toFixed(1)}</span>
              {(result.totalDotDamageToEnemy ?? 0) > 0 && (
                <>
                  {" "}
                  · DoT to enemy {(result.totalDotDamageToEnemy ?? 0).toFixed(1)}
                </>
              )}
            </span>
          </div>
          <div className="text-sm text-zinc-400 mb-2">
            Ending pools: life {Math.max(0, Math.round(result.playerFinal.life))} / ES{" "}
            {Math.round(result.playerFinal.energyShield)} / mana {Math.round(result.playerFinal.mana)} — enemy life{" "}
            {Math.max(0, Math.round(result.enemyLifeFinal))}
          </div>
          {result.totals && (
            <div className="mb-3 grid md:grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Totals</div>
                <div className="text-xs font-mono text-zinc-300 space-y-0.5">
                  <div>
                    Damage to enemy: {result.totals.damageToEnemy.toFixed(1)}{" "}
                    <span className="text-zinc-500">
                      (hits {result.totals.damageToEnemyFromHits.toFixed(1)} · DoT {result.totals.damageToEnemyFromDots.toFixed(1)})
                    </span>
                  </div>
                  <div>
                    Damage to you: {result.totals.damageToPlayer.toFixed(1)}{" "}
                    <span className="text-zinc-500">
                      (enemy hits {result.totals.damageToPlayerFromEnemyHits.toFixed(1)} · DoT {result.totals.damageToPlayerFromDots.toFixed(1)} · self {result.totals.damageToPlayerFromSelf.toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Regen gained (this run)</div>
                <div className="text-xs font-mono text-zinc-300 space-y-0.5">
                  <div>
                    You: +{result.totals.regenToPlayerLife.toFixed(1)} life · +{result.totals.regenToPlayerEnergyShield.toFixed(1)} ES · +{result.totals.regenToPlayerMana.toFixed(1)} mana
                  </div>
                  <div>
                    Enemy: +{result.totals.regenToEnemyLife.toFixed(1)} life · +{result.totals.regenToEnemyEnergyShield.toFixed(1)} ES
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="mb-3 rounded-lg border border-zinc-800 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Key multipliers (from build stats)</div>
            <div className="text-xs font-mono text-zinc-300 space-y-0.5">
              <div>
                Enemies take increased damage: +{(stats.enemiesTakeIncreasedDamagePercent ?? 0).toFixed(1)}%
              </div>
              <div>
                Damage taken mult (gear): ×{(stats.damageTakenMultiplierFromGear ?? 1).toFixed(4)}
              </div>
              <div>
                Damage dealt less mult (gear): ×{(stats.damageDealtLessMult ?? 1).toFixed(4)}
              </div>
              <div>
                Life recovery rate mult: ×{(stats.lifeRecoveryRateMult ?? 1).toFixed(4)} · All recovery rate mult: ×{(stats.recoveryRateMult ?? 1).toFixed(4)}
              </div>
            </div>
          </div>
          {(result.enemyAilmentSummary || (result.enemyDebuffEvents?.length ?? 0) > 0) && (
            <div className="mb-3 rounded-lg border border-violet-800/70 bg-violet-950/25 px-3 py-2 text-sm">
              <div className="text-[10px] uppercase tracking-wider text-violet-300/90 mb-1.5">
                Enemy ailments (this run)
              </div>

              {result.enemyAilmentSummary && (
                <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono text-violet-100/95">
                  <div className="space-y-0.5">
                    <div className="text-zinc-500">Max stacks</div>
                    <div>Bleed: {result.enemyAilmentSummary.maxStacks.bleed}</div>
                    <div>Poison: {result.enemyAilmentSummary.maxStacks.poison}</div>
                    <div>Ignite: {result.enemyAilmentSummary.maxStacks.ignite}</div>
                    <div>Shock: {result.enemyAilmentSummary.maxStacks.shock} (max total +{result.enemyAilmentSummary.maxNonDotMagnitudePct.shock.toFixed(0)}%)</div>
                    <div>Chill: {result.enemyAilmentSummary.maxStacks.chill} (max total −{result.enemyAilmentSummary.maxNonDotMagnitudePct.chill.toFixed(0)}%)</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-zinc-500">Max DoT DPS</div>
                    <div>Bleed: {result.enemyAilmentSummary.maxDotDps.bleed.toFixed(1)}</div>
                    <div>Poison: {result.enemyAilmentSummary.maxDotDps.poison.toFixed(1)}</div>
                    <div>Ignite: {result.enemyAilmentSummary.maxDotDps.ignite.toFixed(1)}</div>
                    <div>Total: {result.enemyAilmentSummary.maxDotDps.total.toFixed(1)}</div>
                  </div>
                </div>
              )}

              {!result.enemyAilmentSummary && (result.enemyDebuffEvents?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-xs font-mono text-violet-100/95">
                  {result.enemyDebuffEvents!.map((e, i) => (
                    <li key={i}>
                      <span className="text-zinc-500">{e.t.toFixed(2)}s</span>{" "}
                      {e.kind === "shock" ? (
                        <span>
                          Shock ailment — +{e.magnitudePct.toFixed(0)}% damage you deal for {e.durationSec.toFixed(1)}s
                        </span>
                      ) : (
                        <span>
                          Chill ailment — {e.magnitudePct.toFixed(0)}% slower enemy attacks for {e.durationSec.toFixed(1)}s
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.logTruncated && (
            <div className="mb-3 text-xs text-zinc-500">
              Combat log was truncated; increase <code className="text-zinc-400">maxLogEntries</code> to see more.
            </div>
          )}
          <div className="max-h-72 overflow-y-auto font-mono text-xs text-zinc-300 space-y-1 border border-zinc-800 rounded-lg p-2 bg-black/30">
            {result.log.map((line, i) => {
              const tone =
                line.kind === "ailment"
                  ? "text-amber-400/95"
                  : line.kind === "dot_tick"
                    ? "text-rose-300/95"
                    : line.kind === "phase"
                      ? "text-zinc-400"
                      : line.kind === "enemy_attack"
                        ? "text-sky-300/95"
                      : "";

              const dmg = line.damage ?? 0;
              const denom = Math.max(1, encounterSummary.maxDamage[line.kind] ?? 0);
              const rel = dmg > 0 ? dmg / denom : 0;
              const heat =
                dmg <= 0
                  ? ""
                  : rel >= 0.9
                    ? "text-fuchsia-300"
                    : rel >= 0.65
                      ? "text-rose-300"
                      : rel >= 0.4
                        ? "text-amber-300"
                        : "text-zinc-300";
              return (
              <div key={i} className={[tone, heat].filter(Boolean).join(" ")}>
                <div>
                  <span className="text-zinc-600">[{line.t.toFixed(2)}s]</span> {line.message}
                </div>
                {Boolean(line.details) && (
                  <details className="ml-5 mt-1 text-[11px] text-zinc-400">
                    <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-300">
                      breakdown
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-zinc-200">
{JSON.stringify(line.details as any, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
