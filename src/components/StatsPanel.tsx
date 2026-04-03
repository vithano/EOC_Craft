import type { ComputedStats } from '../data/formulas';

interface StatsPanelProps {
  stats: ComputedStats;
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  const statBlocks = [
    { label: 'Damage', value: stats.damage, sub: 'base dmg', color: 'text-orange-400', highlight: true },
    { label: 'Eff. Damage', value: stats.effectiveDamage, sub: 'with crits', color: 'text-red-400', highlight: true },
    { label: 'Armor', value: stats.armor, sub: `${stats.damageReduction}% dmg red.`, color: 'text-blue-400', highlight: false },
    { label: 'Evasion', value: stats.evasion, sub: 'dodge rating', color: 'text-purple-400', highlight: false },
    { label: 'Health', value: stats.health, sub: 'hp pool', color: 'text-emerald-400', highlight: false },
    { label: 'Mana', value: stats.mana, sub: 'mana pool', color: 'text-blue-400', highlight: false },
    { label: 'Crit Chance', value: `${stats.critChance}%`, sub: 'critical rate', color: 'text-yellow-400', highlight: false },
    { label: 'Dmg Reduction', value: `${stats.damageReduction}%`, sub: 'from armor', color: 'text-zinc-400', highlight: false },
  ];

  const attributes = ['strength', 'agility', 'intelligence', 'vitality', 'dexterity'] as const;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>📊</span> Computed Stats
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {statBlocks.map(({ label, value, sub, color, highlight }) => (
          <div
            key={label}
            className={`flex flex-col items-center p-2 rounded-lg border text-center
              ${highlight ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-800'}`}
          >
            <span className="text-zinc-500 text-xs mb-1">{label}</span>
            <span className={`text-lg font-bold ${color}`}>{value}</span>
            <span className="text-zinc-600 text-xs">{sub}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Attributes</div>
        <div className="grid grid-cols-5 gap-2">
          {attributes.map((attr) => (
            <div key={attr} className="flex flex-col items-center bg-zinc-800 rounded-lg p-2">
              <span className="text-zinc-500 text-xs uppercase">{attr.slice(0, 3)}</span>
              <span className="text-zinc-100 font-bold text-base">{stats[attr]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
