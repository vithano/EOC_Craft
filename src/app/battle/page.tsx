"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TRAINING_DUMMY } from "../../battle/enemies";
import { simulateEncounter } from "../../battle/engine";
import type { DemoEnemyDef } from "../../battle/types";
import {
  HIT_DAMAGE_TYPE_COLOR_CLASS,
  HIT_DAMAGE_TYPE_LABEL,
} from "../../data/damageTypes";
import { getEquippedEntry, migrateEquippedFromSave } from "../../data/equipment";
import { computeBuildStats, emptyEquipmentModifiers } from "../../data/gameStats";
import { loadStoredPlanner, type StoredPlannerPayload } from "../../lib/eocBuildStorage";

export default function BattleDemoPage() {
  const [enemyDraft, setEnemyDraft] = useState<DemoEnemyDef>({ ...TRAINING_DUMMY });
  const [runKey, setRunKey] = useState(0);
  const [plannerSnapshot, setPlannerSnapshot] = useState<StoredPlannerPayload | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setPlannerSnapshot(loadStoredPlanner());
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

  const result = useMemo(() => {
    void runKey;
    return simulateEncounter({
      stats,
      enemy: enemyDraft,
      options: { maxDurationSeconds: 90, maxLogEntries: 100, dt: 0.05 },
    });
  }, [stats, enemyDraft, runKey]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold">Demo encounter</h1>
            <p className="text-zinc-500 text-xs">
              Uses your saved planner build (<code className="text-zinc-400">eocCraftBuild</code>) vs. a training dummy.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => setPlannerSnapshot(loadStoredPlanner())}
            >
              Reload saved build
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
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Enemy stats (this encounter)</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Name</span>
              <input
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5"
                value={enemyDraft.name}
                onChange={(e) => setEnemyDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Max life</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.maxLife}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, maxLife: Math.max(1, Number(e.target.value) || 0) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Armour</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.armour}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, armour: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Evasion</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.evasionRating}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, evasionRating: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Accuracy</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.accuracy}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, accuracy: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Damage min</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.damageMin}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, damageMin: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Damage max</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.damageMax}
                onChange={(e) =>
                  setEnemyDraft((d) => ({
                    ...d,
                    damageMax: Math.max(d.damageMin, Number(e.target.value) || 0),
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Attacks / s</span>
              <input
                type="number"
                step="0.05"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.aps}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, aps: Math.max(0.1, Number(e.target.value) || 0.1) }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Block % (0–100)</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.blockChance ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setEnemyDraft((d) => ({
                    ...d,
                    blockChance: v <= 0 ? undefined : Math.min(100, Math.max(0, v)),
                  }));
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Crit chance %</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.critChance ?? 0}
                onChange={(e) =>
                  setEnemyDraft((d) => ({
                    ...d,
                    critChance: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 text-xs">Crit mult</span>
              <input
                type="number"
                step="0.1"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.critMultiplier ?? 2}
                onChange={(e) =>
                  setEnemyDraft((d) => ({
                    ...d,
                    critMultiplier: Math.max(1, Number(e.target.value) || 2),
                  }))
                }
              />
            </label>
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
              {enemyDraft.name}: {enemyDraft.maxLife} life · {enemyDraft.aps} atk/s
            </div>
            <div>
              Dmg {enemyDraft.damageMin}–{enemyDraft.damageMax} · acc {enemyDraft.accuracy} · eva{" "}
              {enemyDraft.evasionRating} · arm {enemyDraft.armour}
              {enemyDraft.blockChance != null && enemyDraft.blockChance > 0
                ? ` · ${enemyDraft.blockChance}% block`
                : ""}
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
          {(result.enemyDebuffEvents?.length ?? 0) > 0 && (
            <div className="mb-3 rounded-lg border border-violet-800/70 bg-violet-950/25 px-3 py-2 text-sm">
              <div className="text-[10px] uppercase tracking-wider text-violet-300/90 mb-1.5">
                Enemy ailments — shock / chill (this run)
              </div>
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
                      : "";
              return (
              <div key={i} className={tone}>
                <span className="text-zinc-600">[{line.t.toFixed(2)}s]</span> {line.message}
              </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
