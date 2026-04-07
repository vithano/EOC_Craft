import { FORMULA_DESCRIPTIONS } from "../data/formulas";

export default function FormulaViewer() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-zinc-100 font-semibold text-xs uppercase tracking-wider select-none sm:px-3.5 sm:py-3.5 sm:text-sm [&::-webkit-details-marker]:hidden">
          <span className="shrink-0" aria-hidden>
            🧮
          </span>
          <span>Formula Engine</span>
          <span className="ml-auto text-emerald-400/90 text-xs font-bold tracking-widest">EOC CSV</span>
          <span
            className="shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          >
            ▼
          </span>
        </summary>
        <div className="border-t border-zinc-800 px-3 pb-3 pt-1 sm:px-3.5 sm:pb-3.5">
          <p className="text-zinc-400 text-xs sm:text-sm mb-3 leading-relaxed">
            Core combat formulas match the exported Google Sheets under <code className="text-zinc-500">formulas/</code>.
            The main planner uses <code className="text-blue-400">computeBuildStats</code> in{" "}
            <code className="text-zinc-500">src/data/gameStats.ts</code> (Echoes class data + equipment).{" "}
            <code className="text-zinc-500">formulas.ts</code> exports{" "}
            <code className="text-zinc-500">computeDamageReductionPercentFromArmour</code> (shared DR);{" "}
            <code className="text-zinc-500">computeStats</code> there is an unused legacy stub, not the planner engine.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(FORMULA_DESCRIPTIONS).map(([name, formula]) => (
              <div key={name} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                <div className="text-blue-400 text-xs font-semibold mb-1">{name}</div>
                <div className="text-zinc-300 text-xs font-mono break-words">{formula}</div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
