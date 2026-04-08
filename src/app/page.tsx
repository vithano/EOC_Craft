import BuildPlanner from './BuildPlanner';

export default function Home() {
  return (
    <div className="relative">
      <div className="fixed inset-x-0 top-4 z-[9999] flex justify-center px-4 pointer-events-none">
        <a
          href="/battle?autostart=1"
          className="pointer-events-auto w-full max-w-md sm:w-auto px-10 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xl font-black tracking-wide shadow-[0_18px_50px_rgba(0,0,0,0.5)] border border-amber-300/60 text-center"
          title="Start a default battle (Crucible 50 + 2 random modifiers)"
        >
          Battle
        </a>
      </div>
      <BuildPlanner />
    </div>
  );
}
