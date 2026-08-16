import { useState } from 'react';
import { StoreProvider, useStore } from './store';
import GraphView from './views/GraphView';
import ChangesView from './views/ChangesView';
import BisectView from './views/BisectView';
import FileTree from './components/FileTree';
import CommandLog from './components/CommandLog';
import Toast from './components/Toast';
import { Icon } from './components/Icons';

type View = 'graph' | 'changes';

function Shell() {
  const { repo, status, openRepo } = useStore();
  const [view, setView] = useState<View>('graph');
  const [showTree, setShowTree] = useState(true);
  const [showLog, setShowLog] = useState(false);

  if (!repo) return <Welcome />;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Title bar */}
      <header className="glass mx-3 mt-3 flex h-12 items-center gap-3 px-4" style={{ WebkitAppRegion: 'drag' } as never}>
        <div className="flex items-center gap-2 select-none">
          <span className="text-[15px] font-bold tracking-[0.25em] text-lilac">LUMA</span>
        </div>
        <span className="text-white/30">/</span>
        <span className="truncate font-mono text-xs text-white/70">{repo}</span>
        {status?.branch && (
          <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[11px] text-teal">
            {status.state === 'detached' ? 'detached' : status.branch}
          </span>
        )}
        {status && status.state !== 'branch' && status.state !== 'detached' && (
          <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[11px] text-amber">
            {status.state} in progress
          </span>
        )}
        <div className="flex-1" />
        <div style={{ WebkitAppRegion: 'no-drag' } as never} className="flex items-center gap-2">
          {view === 'changes' && <ChangesActions />}
          <button className="btn text-xs" onClick={() => setShowTree((v) => !v)}>Explorer</button>
          <button className="btn text-xs" onClick={() => setShowLog((v) => !v)}>Commands</button>
          <button className="btn text-xs" onClick={() => openRepo()}>Open…</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Dock */}
        <nav className="glass flex w-14 flex-col items-center gap-1 py-3">
          <DockBtn active={view === 'graph'} onClick={() => setView('graph')} label="History" icon={<Icon name="graph" />} />
          <DockBtn active={view === 'changes'} onClick={() => setView('changes')} label="Changes" icon={<Icon name="changes" />} badge={countDirty()} />
          <div className="mt-auto flex flex-col gap-1">
            <DockBtn active={false} onClick={() => openRepo()} label="Open repository" icon={<Icon name="folder" />} />
          </div>
        </nav>

        {showTree && <FileTree />}

        <main className="min-w-0 flex-1">
          {view === 'graph' ? <GraphView /> : <ChangesView />}
        </main>
      </div>

      {showLog && <CommandLog onClose={() => setShowLog(false)} />}
      {status?.state === 'bisect' && <BisectView active onClose={() => {}} />}
      <Toast />
    </div>
  );

  function countDirty() {
    const n = status?.entries.length ?? 0;
    return n > 0 ? (n > 99 ? '99+' : String(n)) : null;
  }
}

function ChangesActions() {
  return null;
}

function DockBtn({ active, onClick, label, icon, badge }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: string | null }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 ${
        active
          ? 'border-lilac/50 bg-lilac/15 text-lilac shadow-[0_0_16px_rgba(196,181,253,0.25)]'
          : 'border-transparent text-white/50 hover:border-white/10 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {icon}
      {badge && (
        <span className="absolute -right-1 -top-1 rounded-full bg-teal px-1.5 text-[10px] font-bold text-void">{badge}</span>
      )}
    </button>
  );
}

function Welcome() {
  const { openRepo } = useStore();
  const [recent, setRecent] = useState<string[]>([]);
  useState(() => {
    api.recentRepos().then(setRecent);
  });
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-[0.3em] text-lilac" style={{ textShadow: '0 0 40px rgba(196,181,253,.5)' }}>LUMA</h1>
        <p className="mt-3 text-white/50">See your Git. No commands required.</p>
      </div>
      <button className="btn btn-primary px-8 py-3 text-sm" onClick={() => openRepo()}>
        Open a repository
      </button>
      {recent.length > 0 && (
        <div className="glass anim-in w-[420px] p-3">
          <div className="mb-2 px-1 text-[11px] uppercase tracking-wider text-white/40">Recent</div>
          {recent.map((r) => (
            <button key={r} className="block w-full truncate rounded-lg px-3 py-2 text-left font-mono text-xs text-white/70 hover:bg-white/5" onClick={() => openRepo(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { api } from './lib/api';

export default function App() {
  return (
    <StoreProvider>
      <div className="cosmos" />
      <Shell />
    </StoreProvider>
  );
}
