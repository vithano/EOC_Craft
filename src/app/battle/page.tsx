"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEMO_ENEMIES } from "../../battle/enemies";
import { simulateEncounter } from "../../battle/engine";
import type { DemoEnemyDef } from "../../battle/types";
import { DEMO_BUILD_PRESETS } from "../../battle/presets";
import {
  HIT_DAMAGE_TYPE_COLOR_CLASS,
  HIT_DAMAGE_TYPE_LABEL,
} from "../../data/damageTypes";
import { getEquippedEntry, migrateEquippedFromSave } from "../../data/equipment";
import { computeBuildStats } from "../../data/gameStats";
import { loadStoredPlanner, type StoredPlannerPayload } from "../../lib/eocBuildStorage";

const PLANNER_PRESET_ID = "planner";

function totalUpgradePoints(levels: Record<string, number>): number {
  return Object.values(levels).reduce((a, b) => a + b, 0);
}

function plannerHasUsefulData(p: StoredPlannerPayload | null): boolean {
  if (!p) return false;
  if (totalUpgradePoints(p.upgradeLevels) > 0) return true;
  const flat = p.equipmentModifiers;
  return (
    (flat.flatLife ?? 0) +
      (flat.flatArmor ?? 0) +
      (flat.flatDamageMin ?? 0) +
      (flat.flatDamageMax ?? 0) +
      (flat.strBonus ?? 0) +
      (flat.dexBonus ?? 0) +
      (flat.intBonus ?? 0) >
    0
  );
}

function enemyFromPresetId(id: string): DemoEnemyDef {
  const e = DEMO_ENEMIES.find((x) => x.id === id) ?? DEMO_ENEMIES[0];
  return { ...e };
}

export default function BattleDemoPage() {
  const [presetId, setPresetId] = useState<string>(DEMO_BUILD_PRESETS[0].id);
  const [enemyId, setEnemyId] = useState(DEMO_ENEMIES[0].id);
  const [enemyDraft, setEnemyDraft] = useState<DemoEnemyDef>(() => enemyFromPresetId(DEMO_ENEMIES[0].id));
  const [runKey, setRunKey] = useState(0);
  const [plannerSnapshot, setPlannerSnapshot] = useState<StoredPlannerPayload | null>(null);

  useEffect(() => {
    setEnemyDraft(enemyFromPresetId(enemyId));
  }, [enemyId]);

  useEffect(() => {
    queueMicrotask(() => {
      const snap = loadStoredPlanner();
      setPlannerSnapshot(snap);
      if (snap && plannerHasUsefulData(snap)) {
        setPresetId(PLANNER_PRESET_ID);
      }
    });
  }, []);

  const buildFromPlanner = plannerSnapshot && presetId === PLANNER_PRESET_ID;

  const activeConfig = useMemo(() => {
    if (buildFromPlanner && plannerSnapshot) {
      const equippedMap = plannerSnapshot.equipped
        ? migrateEquippedFromSave(plannerSnapshot.equipped)
        : migrateEquippedFromSave(null);
      const weaponItemId = getEquippedEntry(equippedMap, "Weapon").itemId;
      return {
        upgradeLevels: plannerSnapshot.upgradeLevels,
        equipmentModifiers: plannerSnapshot.equipmentModifiers,
        equippedWeaponItemId: weaponItemId,
        ability: plannerSnapshot.ability ?? null,
      };
    }
    const preset = DEMO_BUILD_PRESETS.find((p) => p.id === presetId) ?? DEMO_BUILD_PRESETS[0];
    return preset.config;
  }, [buildFromPlanner, plannerSnapshot, presetId]);

  const stats = useMemo(() => computeBuildStats(activeConfig), [activeConfig]);

  const activeEnemy = useMemo(
    () => ({ ...enemyDraft, id: enemyId }),
    [enemyDraft, enemyId]
  );

  const result = useMemo(() => {
    void runKey;
    return simulateEncounter({
      stats,
      enemy: activeEnemy,
      options: { maxDurationSeconds: 90, maxLogEntries: 100, dt: 0.05 },
    });
  }, [stats, activeEnemy, runKey]);

  const showPlannerOption = plannerHasUsefulData(plannerSnapshot);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold">Demo encounter</h1>
            <p className="text-zinc-500 text-xs">
              Uses <code className="text-zinc-400">computeBuildStats</code> + the same local save as the planner
              (<code className="text-zinc-400">eocCraftBuild</code>).
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
            ← Build planner
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-wider text-zinc-500">Build</span>
            <select
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              {showPlannerOption && (
                <option value={PLANNER_PRESET_ID}>
                  Saved from main planner ({totalUpgradePoints(plannerSnapshot!.upgradeLevels)} pts)
                </option>
              )}
              {DEMO_BUILD_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                const snap = loadStoredPlanner();
                setPlannerSnapshot(snap);
              }}
            >
              Reload saved planner build
            </button>
          </div>
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-wider text-zinc-500">Enemy preset</span>
            <select
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              value={enemyId}
              onChange={(e) => setEnemyId(e.target.value)}
            >
              {DEMO_ENEMIES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-600">
              Stats below load from the preset; edit any field for this run.
            </p>
          </div>
        </div>

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
              <span className="text-zinc-500 text-xs">Armor</span>
              <input
                type="number"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 font-mono"
                value={enemyDraft.armor}
                onChange={(e) =>
                  setEnemyDraft((d) => ({ ...d, armor: Math.max(0, Number(e.target.value) || 0) }))
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
                  {stats.hitDamageByType.length > 1 ? `${HIT_DAMAGE_TYPE_LABEL[row.type]} ` : ""}
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
              Armor {stats.armor} · Evasion {stats.evasionRating}
            </div>
            <div>
              Block {stats.blockChance}% · Dodge {stats.dodgeChance}% · Acc {stats.accuracy}
            </div>
            <div>DPS (sheet avg) {stats.dps.toFixed(1)}</div>
            {stats.classBonusesActive.length > 0 && (
              <div className="text-zinc-500 text-xs pt-2">
                Active bonuses: {stats.classBonusesActive.join(", ")}
              </div>
            )}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-1">
            <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Enemy (active)</div>
            <div>
              {activeEnemy.name}: {activeEnemy.maxLife} life · {activeEnemy.aps} atk/s
            </div>
            <div>
              Dmg {activeEnemy.damageMin}–{activeEnemy.damageMax} · acc {activeEnemy.accuracy} · eva{" "}
              {activeEnemy.evasionRating} · arm {activeEnemy.armor}
              {activeEnemy.blockChance != null && activeEnemy.blockChance > 0
                ? ` · ${activeEnemy.blockChance}% block`
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
            </span>
          </div>
          <div className="text-sm text-zinc-400 mb-2">
            Ending pools: life {Math.max(0, Math.round(result.playerFinal.life))} / ES{" "}
            {Math.round(result.playerFinal.energyShield)} / mana {Math.round(result.playerFinal.mana)} — enemy life{" "}
            {Math.max(0, Math.round(result.enemyLifeFinal))}
          </div>
          <div className="max-h-72 overflow-y-auto font-mono text-xs text-zinc-300 space-y-1 border border-zinc-800 rounded-lg p-2 bg-black/30">
            {result.log.map((line, i) => (
              <div key={i}>
                <span className="text-zinc-600">[{line.t.toFixed(2)}s]</span> {line.message}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
