"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  GAME_CLASSES,
  GAME_CLASSES_BY_ID,
  getClassIcon,
  getClassLevel,
  getClassesInWebOrder,
  getPrerequisiteActivationPoints,
  isClassBonusActive,
  isClassUnlocked,
  MAX_PLANNER_LEVEL,
  type ClassDef,
  type ClassPerLevel,
  type ClassTier,
} from "../data/gameClasses";

export interface EocClassesPanelProps {
  upgradeLevels: Record<string, number>;
  onChangeUpgradeLevels: (next: Record<string, number>) => void;
}

function majorClassIdsWithPoints(levels: Record<string, number>): string[] {
  return GAME_CLASSES.filter((c) => c.tier === "major")
    .map((c) => c.id)
    .filter((id) => getClassLevel(id, levels) > 0);
}

function formatRequirement(cls: ClassDef): string {
  const r = cls.requirement;
  if (r.type === "none") return "No requirement";
  const labeled = r.classIds.map((id) => {
    const n = GAME_CLASSES_BY_ID[id]?.name ?? id;
    const pts = getPrerequisiteActivationPoints(id);
    return `${n} (${pts} pts)`;
  });
  if (r.type === "or") return `Meet one prerequisite: ${labeled.join(" · ")}`;
  return `Meet all prerequisites: ${labeled.join(" + ")}`;
}

function formatPerLevel(perLevel: ClassPerLevel): string {
  const parts: string[] = [];
  if (perLevel.str) parts.push(`+${perLevel.str} STR`);
  if (perLevel.dex) parts.push(`+${perLevel.dex} DEX`);
  if (perLevel.int) parts.push(`+${perLevel.int} INT`);
  return parts.length ? `${parts.join(", ")} PER LEVEL` : "—";
}

/** Distance from canvas center as % of half the square (50% = edge). */
const TIER_RING_PCT: Readonly<Record<ClassTier, number>> = {
  base: 15,
  intermediate: 30,
  major: 43,
};

/**
 * Angles: bases at slot centers; intermediates bisect each base arc; majors bisect each intermediate arc
 * (so each major sits between its two AND prerequisites on the inner ring).
 */
function webNodePosition(
  tier: ClassTier,
  index: number,
  tierCount: number,
  intermediateRingCount: number
) {
  const r = TIER_RING_PCT[tier];
  let angle: number;
  if (tier === "major") {
    const intStep = (2 * Math.PI) / intermediateRingCount;
    const intPhase = intStep / 2;
    angle = -Math.PI / 2 + index * intStep + intPhase + intStep / 2;
  } else {
    const step = (2 * Math.PI) / tierCount;
    const phase = tier === "intermediate" ? step / 2 : 0;
    angle = -Math.PI / 2 + index * step + phase;
  }
  const x = r * Math.cos(angle);
  const y = r * Math.sin(angle);
  return {
    left: `${50 + x}%`,
    top: `${50 + y}%`,
  };
}

const MAX_RANKS_PER_UPGRADE = 5;

function formatUpgradeLine(u: ClassDef["upgrades"][number], pointsInUpgrade: number): string {
  const v = pointsInUpgrade > 0 ? pointsInUpgrade * u.valuePerPoint : u.valuePerPoint;
  const prefix = u.isFlat && pointsInUpgrade > 0 ? "+" : pointsInUpgrade === 0 && u.isFlat ? "+" : "";
  const pct = u.isFlat ? "" : "%";
  return `${prefix}${v}${pct} ${u.label.toUpperCase()}`;
}

interface LineSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function EocClassesPanel({ upgradeLevels, onChangeUpgradeLevels }: EocClassesPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(GAME_CLASSES[0]?.id ?? null);
  const [helpOpen, setHelpOpen] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<LineSeg[]>([]);

  const totalAllocated = useMemo(
    () => Object.values(upgradeLevels).reduce((a, b) => a + b, 0),
    [upgradeLevels]
  );

  const recomputeLines = useCallback(() => {
    const container = treeRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    if (c.width < 10 || c.height < 10) return;
    const next: LineSeg[] = [];
    for (const cls of GAME_CLASSES) {
      if (cls.requirement.type === "none") continue;
      const toEl = nodeRefs.current[cls.id];
      if (!toEl) continue;
      const to = toEl.getBoundingClientRect();
      for (const pid of cls.requirement.classIds) {
        const fromEl = nodeRefs.current[pid];
        if (!fromEl) continue;
        const from = fromEl.getBoundingClientRect();
        next.push({
          x1: from.left + from.width / 2 - c.left,
          y1: from.top + from.height / 2 - c.top,
          x2: to.left + to.width / 2 - c.left,
          y2: to.top + to.height / 2 - c.top,
        });
      }
    }
    setLines(next);
  }, []);

  useLayoutEffect(() => {
    queueMicrotask(() => recomputeLines());
  }, [recomputeLines, upgradeLevels, selectedId]);

  useEffect(() => {
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => recomputeLines()) : null;
    if (treeRef.current && ro) ro.observe(treeRef.current);
    window.addEventListener("resize", recomputeLines);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recomputeLines);
    };
  }, [recomputeLines]);

  const selected = selectedId ? GAME_CLASSES_BY_ID[selectedId] : null;
  const selectedClassLevel = selected ? getClassLevel(selected.id, upgradeLevels) : 0;

  const tryAdd = (cls: ClassDef, upgradeId: string) => {
    const key = `${cls.id}/${upgradeId}`;
    const cur = upgradeLevels[key] ?? 0;
    if (cur >= 5) return;
    if (totalAllocated >= MAX_PLANNER_LEVEL) return;
    if (getClassLevel(cls.id, upgradeLevels) >= cls.maxLevel) return;
    if (!isClassUnlocked(cls.id, upgradeLevels)) return;
    if (cls.tier === "major") {
      const m = majorClassIdsWithPoints(upgradeLevels);
      if (m.length >= 1 && !m.includes(cls.id)) return;
    }
    onChangeUpgradeLevels({ ...upgradeLevels, [key]: cur + 1 });
  };

  const tryRemove = (cls: ClassDef, upgradeId: string) => {
    const key = `${cls.id}/${upgradeId}`;
    const cur = upgradeLevels[key] ?? 0;
    if (cur <= 0) return;
    const next = { ...upgradeLevels };
    if (cur === 1) delete next[key];
    else next[key] = cur - 1;
    onChangeUpgradeLevels(next);
  };

  const clearClass = (cls: ClassDef) => {
    const next = { ...upgradeLevels };
    for (const k of Object.keys(next)) {
      if (k.startsWith(`${cls.id}/`)) delete next[k];
    }
    onChangeUpgradeLevels(next);
  };

  const majorLockMessage =
    "You can only invest in one major class at a time. Clear points in your other major first.";

  const stopHelpBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setHelpOpen(false);
  };

  const setNodeRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) nodeRefs.current[id] = el;
    else delete nodeRefs.current[id];
  };

  const webBase = useMemo(() => getClassesInWebOrder("base"), []);
  const webIntermediate = useMemo(() => getClassesInWebOrder("intermediate"), []);
  const webMajor = useMemo(() => getClassesInWebOrder("major"), []);
  const intermediateRingCount = webIntermediate.length;

  const webTierLists: Readonly<Record<ClassTier, ClassDef[]>> = useMemo(
    () => ({
      base: webBase,
      intermediate: webIntermediate,
      major: webMajor,
    }),
    [webBase, webIntermediate, webMajor]
  );

  return (
    <div className="rounded-xl border border-amber-950/80 bg-[#141019] text-zinc-100 shadow-[0_0_40px_rgba(88,28,135,0.12)] overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-b border-amber-950/50 bg-[#1a1518]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="rounded border border-amber-900/60 bg-[#2a221c] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#352a24] active:translate-y-px"
          >
            Return
          </button>
          <button
            type="button"
            aria-label="Help"
            onClick={() => setHelpOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded border border-zinc-600 bg-zinc-800/80 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
          >
            ?
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold uppercase tracking-widest">
          <span className="text-zinc-400" title={`Level: passive ranks used / max ${MAX_PLANNER_LEVEL}`}>
            Level{" "}
            <span className="text-cyan-200/95 tabular-nums">
              {totalAllocated}/{MAX_PLANNER_LEVEL}
            </span>
          </span>
        </div>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={stopHelpBackdrop}
          role="presentation"
        >
          <div
            className="max-h-[min(80vh,420px)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-2xl"
            role="dialog"
            aria-labelledby="eoc-tree-help-title"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2 mb-3">
              <h2 id="eoc-tree-help-title" className="text-zinc-100 font-semibold">
                Class tree
              </h2>
              <button
                type="button"
                className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={() => setHelpOpen(false)}
              >
                ✕
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400 text-xs leading-relaxed">
              <li>Classes sit on three rings (base → path → ascend). Click a node to edit; lines show prerequisites.</li>
              <li>Spend up to 5 ranks per small passive; each class is capped by its max level; total ranks are capped at {MAX_PLANNER_LEVEL} (Level).</li>
              <li>Unlock path and ascend classes by meeting prerequisite points (10 on base, 15 on others).</li>
              <li>Only one major class may hold points at a time in this planner.</li>
              <li>Purple glow is selection; amber/green show progress and class bonus.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Radial spiderweb + upgrade panel: stacked on small screens, side-by-side from lg */}
      <div className="flex min-h-0 flex-col gap-0 lg:flex-row lg:items-stretch">
        <div className="flex w-full items-center justify-center border-b border-amber-950/40 px-1 py-2 pb-3 sm:px-2 sm:py-2.5 sm:pb-4 lg:w-auto lg:shrink-0 lg:px-2.5 lg:py-2 lg:pb-2 lg:min-h-0 lg:flex-none lg:border-b-0 lg:border-r lg:border-amber-950/40">
          <div
            ref={treeRef}
            className="relative aspect-square mx-auto w-full shrink-0 overflow-visible select-none max-w-[min(calc(100vw-1rem),340px)] sm:max-w-[min(calc(100vw-2rem),380px)] lg:w-[400px] lg:max-w-[min(400px,calc(100vw-24rem))] xl:w-[420px] xl:max-w-[min(420px,calc(100vw-26rem))]"
          >
            <div
              className="absolute inset-0 overflow-hidden rounded-lg border border-amber-950/30"
              aria-hidden
            >
              <div
                className="absolute inset-0 opacity-[0.97]"
                style={{
                  background: `
                    radial-gradient(circle at 50% 50%, rgba(76, 29, 149, 0.38) 0%, transparent 40%),
                    radial-gradient(circle at 50% 50%, rgba(30, 27, 45, 0.95) 0%, #07060c 65%)
                  `,
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Ccircle cx=%222%22 cy=%222%22 r=%220.9%22 fill=%22rgba(255,255,255,0.05)%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Decorative web: rings + spokes */}
            <svg
              className="pointer-events-none absolute inset-0 z-0 size-full text-white/25"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              xmlns="http://www.w3.org/2000/svg"
            >
              
            </svg>

            <svg className="absolute inset-0 z-[1] size-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              {lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="rgba(255,255,255,0.42)"
                  strokeWidth={1}
                />
              ))}
            </svg>

            <button
              type="button"
              onClick={() => onChangeUpgradeLevels({})}
              className="absolute right-2 top-2 z-[4] flex flex-col items-end gap-0.5 rounded border border-amber-900/60 bg-[#2a221c]/95 px-2.5 py-1.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-[#352a24] sm:right-3 sm:top-3"
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-200/90 sm:text-[10px]">Reset</span>
              <span className="text-[8px] text-zinc-500">All points</span>
            </button>

            <div className="absolute inset-0 z-[2]">
              {(["base", "intermediate", "major"] as const).map((tier) => {
                const tierList = webTierLists[tier];
                const n = tierList.length;
                return tierList.map((cls, index) => {
                  const pos = webNodePosition(tier, index, n, intermediateRingCount);
                  const unlocked = isClassUnlocked(cls.id, upgradeLevels);
                  const level = getClassLevel(cls.id, upgradeLevels);
                  const bonusOn = isClassBonusActive(cls.id, upgradeLevels);
                  const selectedNode = selectedId === cls.id;
                  const icon = getClassIcon(cls.id);

                  return (
                    <div
                      key={cls.id}
                      className="absolute"
                      style={{ left: pos.left, top: pos.top, transform: "translate(-50%, -50%)" }}
                    >
                      <button
                        type="button"
                        title={cls.name}
                        onClick={() => setSelectedId(cls.id)}
                        className={`
                          group relative m-0 block border-0 bg-transparent p-0 cursor-pointer
                          ${!unlocked ? "opacity-38 saturate-50" : ""}
                        `}
                      >
                        <span
                          ref={setNodeRef(cls.id)}
                          className={`
                            relative inline-flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10
                            border-2 bg-gradient-to-b from-zinc-800/95 to-zinc-950/95 text-base sm:text-lg
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.45)]
                            transition-[box-shadow,transform,border-color] duration-200
                            ${
                              selectedNode
                                ? "border-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.5),inset_0_0_10px_rgba(167,139,250,0.12)] scale-[1.03]"
                                : bonusOn
                                  ? "border-emerald-500/80 ring-1 ring-emerald-400/40"
                                  : level > 0
                                    ? "border-amber-600/80 ring-1 ring-amber-500/30"
                                    : "border-zinc-600/80"
                            }
                            ${unlocked ? "hover:border-zinc-400" : ""}
                          `}
                          style={{
                            clipPath:
                              "polygon(12% 0%, 88% 0%, 100% 12%, 100% 88%, 88% 100%, 12% 100%, 0% 88%, 0% 12%)",
                          }}
                        >
                          {icon}
                          <span
                            className="pointer-events-none absolute -left-0.5 -top-0.5 z-[1] flex h-[14px] min-w-[14px] items-center justify-center rounded-br bg-black/85 px-0.5 text-[7px] font-bold tabular-nums text-zinc-200 border border-zinc-600/90 sm:h-[15px] sm:text-[8px]"
                            aria-label={`Points in ${cls.name}`}
                          >
                            {level}
                          </span>
                        </span>
                        <span className="pointer-events-none absolute left-1/2 top-full z-[1] mt-0.5 w-max max-w-[4.5rem] -translate-x-1/2 text-center text-[6px] font-medium uppercase leading-tight text-zinc-500 group-hover:text-zinc-400 sm:max-w-[5rem] sm:mt-1 sm:text-[7px]">
                          {cls.name}
                        </span>
                      </button>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-col bg-[#18131a] border-t border-amber-950/30 lg:min-h-0 lg:w-[320px] xl:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l lg:border-amber-950/30">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-zinc-500 text-sm lg:min-h-[12rem]">
              <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">No class selected</p>
              <p className="text-xs max-w-[220px] leading-relaxed">
                Choose a node on the tree or press Return, then click a class.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:min-h-0">
              <div className="shrink-0 border-b border-amber-950/50 bg-[#1c1619] px-2.5 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200/90 mb-1">
                  Class bonus
                </div>
                <p className="text-[9px] font-medium leading-snug text-cyan-100/80">
                  {selected.classBonusDescription}
                </p>
              </div>

              <div className="shrink-0 border-b border-amber-950/40 bg-gradient-to-r from-[#241e22] to-[#1a1518] px-2.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-amber-100/95 truncate sm:text-base">
                      {selected.name}
                    </h2>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200/75">
                      {formatPerLevel(selected.perLevel)}
                    </p>
                  </div>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rotate-45 border border-amber-800/70 bg-[#2a221c] text-[10px] font-bold text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    title="Class points"
                  >
                    <span className="-rotate-45">{getClassLevel(selected.id, upgradeLevels)}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-px ${
                      isClassUnlocked(selected.id, upgradeLevels)
                        ? "bg-zinc-800/90 text-zinc-300"
                        : "bg-red-950/60 text-red-300"
                    }`}
                  >
                    {isClassUnlocked(selected.id, upgradeLevels) ? "Unlocked" : "Locked"}
                  </span>
                  {isClassBonusActive(selected.id, upgradeLevels) && (
                    <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-px bg-emerald-950/70 text-emerald-300">
                      Bonus active
                    </span>
                  )}
                  <span className="text-[9px] text-zinc-500 leading-tight">
                    Max {selected.maxLevel} · bonus @ {selected.classBonusRequiredPoints}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5">
                  <div className="flex justify-between items-baseline gap-2 text-[8px] font-bold uppercase tracking-wide text-zinc-500">
                    <span>Class points</span>
                    <span className="tabular-nums text-amber-200/95 shrink-0">
                      {selectedClassLevel} / {selected.maxLevel}
                    </span>
                  </div>
                  <div
                    className="flex h-1.5 gap-px overflow-hidden rounded bg-zinc-950 ring-1 ring-zinc-800/90"
                    role="img"
                    aria-label={`${selectedClassLevel} of ${selected.maxLevel} class points on the bar`}
                  >
                    {Array.from({ length: selected.maxLevel }, (_, i) => (
                      <div
                        key={i}
                        title={`Point ${i + 1}${i < selectedClassLevel ? " (allocated)" : ""}`}
                        className={`min-w-0 flex-1 transition-[background-color,box-shadow] duration-300 ease-out ${
                          i < selectedClassLevel
                            ? "bg-gradient-to-b from-amber-400 to-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                            : "bg-zinc-800/95"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-1.5 text-[9px] text-zinc-500 leading-snug">{formatRequirement(selected)}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                {selected.tier === "major" &&
                  majorClassIdsWithPoints(upgradeLevels).length >= 1 &&
                  !majorClassIdsWithPoints(upgradeLevels).includes(selected.id) &&
                  getClassLevel(selected.id, upgradeLevels) === 0 && (
                    <p className="text-amber-400/90 text-[10px] leading-snug">{majorLockMessage}</p>
                  )}

                {selected.upgrades.map((u) => {
                  const key = `${selected.id}/${u.id}`;
                  const pts = upgradeLevels[key] ?? 0;
                  const canSpend =
                    totalAllocated < MAX_PLANNER_LEVEL &&
                    isClassUnlocked(selected.id, upgradeLevels) &&
                    getClassLevel(selected.id, upgradeLevels) < selected.maxLevel &&
                    pts < 5 &&
                    !(
                      selected.tier === "major" &&
                      majorClassIdsWithPoints(upgradeLevels).length >= 1 &&
                      !majorClassIdsWithPoints(upgradeLevels).includes(selected.id)
                    );
                  const cannotAdd = !canSpend || pts >= 5;

                  const line = formatUpgradeLine(u, pts);
                  return (
                    <div
                      key={u.id}
                      className="rounded-md border border-zinc-800/90 bg-[#141018]/90 py-1 pl-1 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    >
                      <div className="flex items-center gap-0.5">
                        <div className="flex w-8 shrink-0 flex-col items-center gap-px">
                          <button
                            type="button"
                            aria-label="Decrease rank"
                            onClick={() => tryRemove(selected, u.id)}
                            disabled={pts <= 0}
                            className="flex h-8 w-full items-center justify-center rounded border border-zinc-700 bg-zinc-800/90 text-base leading-none text-zinc-200 hover:bg-zinc-700 disabled:opacity-25"
                          >
                            −
                          </button>
  
                        </div>
                        <div
                          className="relative h-8 min-w-0 flex-1 overflow-hidden rounded border border-zinc-700/85 bg-zinc-900/90 shadow-[inset_0_1px_0_rgba(0,0,0,0.25)]"
                          role="group"
                          aria-label={`${line}. ${pts} of ${MAX_RANKS_PER_UPGRADE} ranks.`}
                          title={line}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-b from-amber-500 to-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-[width] duration-300 ease-out"
                            style={{ width: `${(pts / MAX_RANKS_PER_UPGRADE) * 100}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center px-1 pointer-events-none">
                            <span className="max-w-full truncate text-center text-[7px] font-bold uppercase leading-tight text-zinc-100 drop-shadow-[0_0_3px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,1)] sm:text-[8px]">
                              {line}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Increase rank"
                          onClick={() => tryAdd(selected, u.id)}
                          disabled={cannotAdd}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800/90 text-base leading-none text-zinc-200 hover:bg-zinc-700 disabled:opacity-25"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}

                {getClassLevel(selected.id, upgradeLevels) > 0 && (
                  <button
                    type="button"
                    className="mt-1 w-full rounded-md border border-red-900/45 bg-red-950/25 py-1.5 text-[9px] font-bold uppercase tracking-wide text-red-400 hover:bg-red-950/45"
                    onClick={() => clearClass(selected)}
                  >
                    Clear {selected.name}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
