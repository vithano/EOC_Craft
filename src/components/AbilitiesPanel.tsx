"use client";

import { useMemo } from "react";
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
  const weaponTag = useMemo(() => weaponAbilityTagFromItemId(weaponItemId), [weaponItemId]);
  const usable = useMemo(() => abilitiesUsableWithWeapon(weaponTag), [weaponTag]);

  const grouped = useMemo(() => {
    const m: Record<EocAbilityType, EocAbilityDefinition[]> = { Melee: [], Ranged: [], Spells: [] };
    for (const a of usable) {
      m[a.type].push(a);
    }
    return m;
  }, [usable]);

  const selected = ability.abilityId ? EOC_ABILITY_BY_ID[ability.abilityId] : undefined;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <div className="text-zinc-100 font-semibold text-sm uppercase tracking-wider">Ability</div>
          <p className="text-zinc-500 text-xs mt-0.5">
            From <code className="text-zinc-400">abilities(1.3.2).csv</code> — filtered by equipped weapon
            {weaponTag ? (
              <span className="text-zinc-600">
                {" "}
                (tag <span className="text-amber-500/90 font-mono">{weaponTag}</span>)
              </span>
            ) : (
              <span className="text-zinc-600"> (no weapon: melee/ranged disabled)</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 min-w-0">
          <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">Skill</span>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-amber-600/80"
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

        <label className="w-full sm:w-36">
          <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">Level</span>
          <input
            type="number"
            min={0}
            max={20}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-amber-600/80"
            value={ability.abilityLevel}
            onChange={(e) =>
              onChangeAbility({
                ...ability,
                abilityLevel: Math.min(20, Math.max(0, Math.floor(Number(e.target.value) || 0))),
              })
            }
          />
        </label>

        <label className="flex-1 min-w-0 sm:min-w-[200px]">
          <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
            Attunement {ability.attunementPct}%
          </span>
          <input
            className="w-full accent-amber-500"
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
        <div className="mt-4 text-xs text-zinc-500 space-y-2 border-t border-zinc-800 pt-3">
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
