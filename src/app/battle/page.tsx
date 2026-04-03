"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEMO_ENEMIES } from "../../battle/enemies";
import { simulateEncounter } from "../../battle/engine";
import { DEMO_BUILD_PRESETS } from "../../battle/presets";
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

export default function BattleDemoPage() {
  const [presetId, setPresetId] = useState<string>(DEMO_BUILD_PRESETS[0].id);
  const [enemyId, setEnemyId] = useState(DEMO_ENEMIES[0].id);
  const [runKey, setRunKey] = useState(0);
  const [plannerSnapshot, setPlannerSnapshot] = useState<StoredPlannerPayload | null>(null);

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
      return {
        upgradeLevels: plannerSnapshot.upgradeLevels,
        equipmentModifiers: plannerSnapshot.equipmentModifiers,
      };
    }
    const preset = DEMO_BUILD_PRESETS.find((p) => p.id === presetId) ?? DEMO_BUILD_PRESETS[0];
    return preset.config;
  }, [buildFromPlanner, plannerSnapshot, presetId]);

  const stats = useMemo(() => computeBuildStats(activeConfig), [activeConfig]);

  const result = useMemo(() => {
    void runKey;
    const enemy = DEMO_ENEMIES.find((e) => e.id === enemyId) ?? DEMO_ENEMIES[0];
    return simulateEncounter({
      stats,
      enemy,
      options: { maxDurationSeconds: 90, maxLogEntries: 100, dt: 0.05 },
    });
  }, [stats, enemyId, runKey]);

  const enemy = DEMO_ENEMIES.find((e) => e.id === enemyId) ?? DEMO_ENEMIES[0];

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
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Enemy</span>
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
          </label>
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
            <div>
              Hit {stats.hitDamageMin}–{stats.hitDamageMax} · {stats.aps.toFixed(2)} atk/s ·{" "}
              {stats.critChance.toFixed(1)}% crit
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
            <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Enemy</div>
            <div>
              {enemy.name}: {enemy.maxLife} life · {enemy.aps} atk/s
            </div>
            <div>
              Dmg {enemy.damageMin}–{enemy.damageMax} · acc {enemy.accuracy} · eva {enemy.evasionRating} · arm{" "}
              {enemy.armor}
              {enemy.blockChance != null ? ` · ${enemy.blockChance}% block` : ""}
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
