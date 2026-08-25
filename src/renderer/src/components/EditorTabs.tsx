import { useWorkspace } from '../workspace';
import { Icon } from './Icons';
import { fileBadge } from '../languages';

export default function EditorTabs() {
  const { tabs, active, setActive, closeTab } = useWorkspace();
  if (tabs.length === 0) return null;
  return (
    <div className="glass-soft mx-3 flex items-center gap-1 overflow-x-auto p-1.5">
      {tabs.map((t) => {
        const badge = fileBadge(t.path);
        return (
          <div
            key={t.path}
            onClick={() => setActive(t.path)}
            title={t.path}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-all duration-150 ${
              active === t.path
                ? 'bg-lilac/15 text-white/90 shadow-[inset_0_0_0_1px_rgba(196,181,253,0.25)]'
                : 'text-white/50 hover:bg-white/5'
            }`}
          >
            <span
              className="rounded px-1 text-[8px] font-bold leading-4"
              style={{ color: badge.color, background: `${badge.color}1c` }}
            >
              {badge.label}
            </span>
            <span className="font-mono">{t.name}</span>
            {t.dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
            <button
              className="ml-0.5 rounded p-0.5 text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
