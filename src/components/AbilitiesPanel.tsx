"use client";

import { useMemo } from "react";
import { useGameData } from "../contexts/GameDataContext";
import type { AbilitySelectionState } from "../data/gameStats";
import {
  EOC_ABILITY_BY_ID,
  abilitiesUsableWithWeapon,
  attunementLabel,
  weaponAbilityTagFromItemId,
  type EocAbilityDefinition,
  type EocAbilityType,
} from "../data/eocAbilities";

export interface AbilitiesPanelProps {
  weaponItemId: string;
  ability: AbilitySelectionState;
  onChangeAbility: (next: AbilitySelectionState) => void;
}

export default function AbilitiesPanel({ weaponItemId, ability, onChangeAbility }: AbilitiesPanelProps) {
  // Subscribe to sheet data updates so ability list re-renders when live data arrives
  const { lastUpdated: sheetVersion } = useGameData();
  const weaponTag = useMemo(() => weaponAbilityTagFromItemId(weaponItemId), [weaponItemId]);
  const usable = useMemo(() => abilitiesUsableWithWeapon(weaponTag), [weaponTag, sheetVersion]);

  const grouped = useMemo(() => {
    const m: Record<EocAbilityType, EocAbilityDefinition[]> = { Melee: [], Ranged: [], Spells: [] };
    for (const a of usable) {
      m[a.type].push(a);
    }
    return m;
  }, [usable]);

  const selected = ability.abilityId ? EOC_ABILITY_BY_ID[ability.abilityId] : undefined;

  return (
    <div className="bg-[#0f0d16] border border-amber-900/30 rounded-lg p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-cinzel text-amber-200/80 text-[10px] uppercase tracking-widest font-bold">Ability</div>
        {weaponTag ? (
          <span className="text-zinc-600 text-[10px]">
            Weapon tag: <span className="text-amber-500/70 font-mono">{weaponTag}</span>
          </span>
        ) : (
          <span className="text-zinc-700 text-[10px]">No weapon equipped</span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 min-w-0">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">Skill</span>
          <select
            className="w-full bg-[#1a1624] border border-amber-900/25 text-zinc-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-amber-600/60"
            value={ability.abilityId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              onChangeAbility({ ...ability, abilityId: id });
            }}
          >
            <option value="">— None (weapon only) —</option>
            {(Object.keys(grouped) as Array<keyof typeof grouped>).map((t) => {
              const list = grouped[t];
              if (!list.length) return null;
              return (
                <optgroup key={t} label={t}>
                  {list.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>

        <label className="w-full sm:w-32">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">Level</span>
          <input
            type="number"
            min={0}
            // Ability levels can exceed 20 via gear/upgrades; don't clamp in the UI.
            className="w-full bg-[#1a1624] border border-amber-900/25 text-zinc-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-amber-600/60"
            value={ability.abilityLevel}
            onChange={(e) =>
              onChangeAbility({
                ...ability,
                abilityLevel: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        </label>

        <label className="flex-1 min-w-0 sm:min-w-[180px]">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
            Attunement {ability.attunementPct}%
          </span>
          <input
            className="w-full accent-amber-500 mt-1"
            type="range"
            min={0}
            max={100}
            step={1}
            value={ability.attunementPct}
            onChange={(e) =>
              onChangeAbility({ ...ability, attunementPct: Math.floor(Number(e.target.value)) })
            }
          />
        </label>
      </div>

      {selected && (
        <div className="mt-2.5 text-[11px] text-zinc-500 space-y-1.5 border-t border-amber-900/20 pt-2.5">
          <div className="text-zinc-400 font-medium">{selected.name}</div>
          {selected.lines.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-600">
              {selected.lines.slice(0, 5).map((line) => (
                <li key={line.slice(0, 48)}>{line}</li>
              ))}
            </ul>
          )}
          {(selected.attunement0 || selected.attunement100) && (
            <div className="text-zinc-600">
              <span className="text-zinc-500">Attunement: </span>
              {attunementLabel(selected, ability.attunementPct) || "—"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
