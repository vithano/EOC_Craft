"use client";

import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS } from '../data/equipment';
import type { Rarity } from '../data/equipment';

interface EquipmentPanelProps {
  equipped: Record<string, string>;
  onEquip: (slot: string, itemId: string) => void;
}

const rarityClass: Record<Rarity, string> = {
  common: 'text-zinc-400',
  uncommon: 'text-emerald-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
};

export default function EquipmentPanel({ equipped, onEquip }: EquipmentPanelProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>🎒</span> Equipment
      </div>
      <div className="flex flex-col gap-3">
        {EQUIPMENT_SLOTS.map((slot) => {
          const items = EQUIPMENT_ITEMS[slot] ?? [];
          const selectedId = equipped[slot] ?? 'none';
          const selectedItem = items.find((i) => i.id === selectedId) ?? items[0];
          const mods = selectedItem?.modifiers ?? {};
          const hasMods = Object.keys(mods).length > 0;

          return (
            <div key={slot}>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs w-16 shrink-0">{slot}</span>
                <select
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                  value={selectedId}
                  onChange={(e) => onEquip(slot, e.target.value)}
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {selectedItem?.rarity && (
                  <span className={`text-xs font-medium w-16 text-right shrink-0 ${rarityClass[selectedItem.rarity]}`}>
                    {selectedItem.rarity}
                  </span>
                )}
              </div>
              {hasMods && (
                <div className="flex flex-wrap gap-1 mt-1 ml-18 pl-[4.5rem]">
                  {Object.entries(mods).map(([k, v]) => (
                    <span key={k} className="text-xs bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded">
                      +{v} {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
