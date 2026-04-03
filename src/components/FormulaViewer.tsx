import { FORMULA_DESCRIPTIONS } from '../data/formulas';
import { ENEMY_MODIFIERS } from '../data/enemyModifiers';

export default function FormulaViewer() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>🧮</span> Formula Engine
        <span className="ml-auto text-emerald-400/90 text-xs font-bold tracking-widest">EOC CSV</span>
      </div>
      <div>
        <p className="text-zinc-400 text-sm mb-4">
          Core combat formulas match the exported Google Sheets under <code className="text-zinc-500">formulas/</code>.
          The main planner uses <code className="text-blue-400">computeBuildStats</code> in{" "}
          <code className="text-zinc-500">src/data/gameStats.ts</code> (Echoes class data + equipment). The legacy{" "}
          <code className="text-zinc-500">computeStats</code> path in <code className="text-zinc-500">formulas.ts</code>{" "}
          remains for armour / ailment preview helpers used inside that pipeline.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {Object.entries(FORMULA_DESCRIPTIONS).map(([name, formula]) => (
            <div key={name} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
              <div className="text-blue-400 text-xs font-semibold mb-1">{name}</div>
              <div className="text-zinc-300 text-xs font-mono break-words">{formula}</div>
            </div>
          ))}
        </div>
        <div className="mb-6">
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Enemy modifiers (list only)</div>
          <div className="flex flex-wrap gap-1.5">
            {ENEMY_MODIFIERS.map((m) => (
              <span
                key={m.name}
                title={m.description}
                className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-3 bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
          <span className="text-2xl">🔌</span>
          <div>
            <h3 className="text-zinc-100 font-semibold text-sm mb-1">Implementation</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Sheet-aligned helpers: <code className="text-blue-400">src/data/eocFormulas.ts</code>. Player build output:{" "}
              <code className="text-blue-400">src/data/gameStats.ts</code> →{" "}
              <code className="text-blue-400">computeBuildStats</code>. Armour and ailment math reused from{" "}
              <code className="text-blue-400">src/data/formulas.ts</code> (<code className="text-blue-400">FormulaContext</code> for
              Nexus / ES / multipliers).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
