import { useStore } from '../store';
import { Icon } from './Icons';

export default function CommandLog({ onClose }: { onClose: () => void }) {
  const { commands } = useStore();
  return (
    <aside className="glass anim-in absolute bottom-3 right-3 z-40 flex max-h-64 w-[420px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wider text-white/50">
          What Luma runs for you
        </span>
        <button className="text-white/50 hover:text-white" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="overflow-y-auto p-2">
        {commands.length === 0 && (
          <div className="px-2 py-3 text-xs text-white/40">
            Nothing yet. Every visual action will show its git equivalent here.
          </div>
        )}
        {commands.map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
          >
            <span className="mt-0.5 text-teal">$</span>
            <code className="font-mono text-[11px] leading-relaxed text-white/80">{c.command}</code>
          </div>
        ))}
      </div>
    </aside>
  );
}
