"use client";

import { CLASSES } from '../data/classes';

interface ClassSelectorProps {
  selectedClass: string;
  onSelectClass: (id: string) => void;
}

export default function ClassSelector({ selectedClass, onSelectClass }: ClassSelectorProps) {
  const cls = CLASSES.find((c) => c.id === selectedClass);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>🧙</span> Class
      </div>
      <div className="grid grid-cols-5 gap-2 mb-4">
        {CLASSES.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectClass(c.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer
              ${selectedClass === c.id
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200'}`}
          >
            <span className="text-xl">{c.icon}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      {cls && (
        <>
          <p className="text-zinc-400 text-sm mb-4">{cls.description}</p>
          <div className="flex flex-col gap-2">
            {Object.entries(cls.baseStats).map(([stat, val]) => (
              <div key={stat} className="flex items-center gap-2">
                <span className="text-zinc-400 text-xs capitalize w-24">{stat}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (val / 30) * 100)}%` }}
                  />
                </div>
                <span className="text-zinc-300 text-xs w-6 text-right">{val}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
