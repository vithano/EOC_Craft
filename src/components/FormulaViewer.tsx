import { FORMULA_DESCRIPTIONS } from '../data/formulas';

export default function FormulaViewer() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>🧮</span> Formula Engine
        <span className="ml-auto text-yellow-400 text-xs font-bold tracking-widest">PLACEHOLDER</span>
      </div>
      <div>
        <p className="text-zinc-400 text-sm mb-4">
          The following formulas are{' '}
          <span className="text-yellow-400">placeholders</span> used to compute derived stats.
          In a future version, you will be able to plug in custom formula functions directly
          via the formula editor or an external config file.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {Object.entries(FORMULA_DESCRIPTIONS).map(([name, formula]) => (
            <div key={name} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
              <div className="text-blue-400 text-xs font-semibold mb-1">{name}</div>
              <div className="text-zinc-300 text-xs font-mono">{formula}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
          <span className="text-2xl">🔌</span>
          <div>
            <h3 className="text-zinc-100 font-semibold text-sm mb-1">Custom Formula Plug-in (Coming Soon)</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Replace any formula by exporting a <code className="text-blue-400">computeStats</code> function
              from <code className="text-blue-400">src/data/formulas.ts</code>. The function receives{' '}
              <code className="text-blue-400">(classId, equipModifiers, upgradeModifiers, classBaseStats)</code>{' '}
              and must return an object with all stat keys. All placeholder comments are marked
              with <code className="text-blue-400">// PLACEHOLDER FORMULA:</code> in the source.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
