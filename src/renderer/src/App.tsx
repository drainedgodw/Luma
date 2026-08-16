import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { SettingsProvider } from './settings';
import { WorkspaceProvider, useWorkspace } from './workspace';
import GraphView from './views/GraphView';
import ChangesView from './views/ChangesView';
import EditorWorkspace from './views/EditorWorkspace';
import SettingsView from './views/SettingsView';
import StoreView from './views/StoreView';
import FileTree from './components/FileTree';
import { ExplorerWake } from './components/FileTree';
import EditorTabs from './components/EditorTabs';
import CommandLog from './components/CommandLog';
import Toast from './components/Toast';
import BisectView from './views/BisectView';
import { Icon } from './components/Icons';
import logo from './assets/logo.png';

type View = 'editor' | 'graph' | 'changes' | 'languages' | 'settings';

function Shell() {
  const { repo, status, openRepo } = useStore();
  const { openFile } = useWorkspace();
  const [view, setView] = useState<View>('graph');
  const [showLog, setShowLog] = useState(false);
  const [explorerAwake, setExplorerAwake] = useState(false);

  useEffect(() => {
    const onOpenFile = (e: Event) => {
      openFile((e as CustomEvent<string>).detail);
      setView('editor');
    };
    window.addEventListener('luma:open-file', onOpenFile);
    return () => window.removeEventListener('luma:open-file', onOpenFile);
  }, [openFile]);

  if (!repo) return <Welcome />;

  const dirtyCount = status?.entries.length ?? 0;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Title bar */}
      <header className="glass mx-3 mt-3 flex h-12 items-center gap-3 px-4" style={{ WebkitAppRegion: 'drag' } as never}>
        <img src={logo} alt="" className="h-7 w-7 rounded-lg" style={{ filter: 'drop-shadow(0 0 10px rgba(196,181,253,.45))' }} />
        <span className="text-[14px] font-bold tracking-[0.25em] text-lilac">LUMA</span>
        <span className="text-white/20">/</span>
        <span className="truncate font-mono text-xs text-white/60">{repo.split('/').pop()}</span>
        {status?.branch && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${status.state === 'detached' ? 'border-amber/40 bg-amber/10 text-amber' : 'border-teal/40 bg-teal/10 text-teal'}`}>
            ⎇ {status.state === 'detached' ? 'detached' : status.branch}
            {status.ahead > 0 && <span className="ml-1 text-white/70">↑{status.ahead}</span>}
            {status.behind > 0 && <span className="ml-1 text-white/70">↓{status.behind}</span>}
          </span>
        )}
        {status && status.state !== 'branch' && status.state !== 'detached' && (
          <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[11px] text-amber">
            {status.state} in progress
          </span>
        )}
        <div className="flex-1" />
        <div style={{ WebkitAppRegion: 'no-drag' } as never} className="flex items-center gap-2">
          <button className="btn text-xs" title="Show the git commands Luma runs for you" onClick={() => setShowLog((v) => !v)}>Commands</button>
          <button className="btn text-xs" title="Open another repository" onClick={() => openRepo()}>Open…</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Dock */}
          <nav className="glass flex w-14 flex-col items-center gap-1.5 py-3">
            <img src={logo} alt="Luma" className="mb-1 h-8 w-8 rounded-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(196,181,253,.4))' }} />
            <div className="mb-1 h-px w-8 bg-white/10" />
            <DockBtn active={view === 'editor'} onClick={() => setView('editor')} label="Editor" icon={<Icon name="code" />} />
            <DockBtn active={view === 'graph'} onClick={() => setView('graph')} label="History" icon={<Icon name="graph" />} />
            <DockBtn active={view === 'changes'} onClick={() => setView('changes')} label="Changes" icon={<Icon name="changes" />} badge={dirtyCount > 0 ? String(dirtyCount > 99 ? '99+' : dirtyCount) : null} />
            <DockBtn active={view === 'languages'} onClick={() => setView('languages')} label="Languages" icon={<Icon name="grid" />} />
            <div className="mt-auto flex flex-col gap-1.5">
              <DockBtn active={view === 'settings'} onClick={() => setView('settings')} label="Settings" icon={<Icon name="gear" />} />
              <DockBtn active={false} onClick={() => openRepo()} label="Open repository" icon={<Icon name="folder" />} />
            </div>
          </nav>

          <ExplorerWake onWake={() => setExplorerAwake(true)} />
          <FileTree awake={explorerAwake} onCollapse={() => setExplorerAwake(false)} />

          <main className="flex min-w-0 flex-1 flex-col gap-2">
            {view === 'editor' && <EditorTabs />}
            {view === 'graph' ? <GraphView /> : view === 'changes' ? <ChangesView onOpenFile={openFile} /> : view === 'languages' ? <StoreView /> : view === 'settings' ? <SettingsView /> : <EditorWorkspace />}
          </main>
        </div>
      </div>

      {showLog && <CommandLog onClose={() => setShowLog(false)} />}
      {status?.state === 'bisect' && <BisectView active onClose={() => {}} />}
      <Toast />
    </div>
  );
}

function DockBtn({ active, onClick, label, icon, badge }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: string | null }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 ${
        active
          ? 'border-lilac/50 bg-lilac/15 text-lilac shadow-[0_0_16px_rgba(196,181,253,0.25)]'
          : 'border-transparent text-white/45 hover:border-white/10 hover:bg-white/5 hover:text-white/80'
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
    import('./lib/api').then(({ api }) => api.recentRepos().then(setRecent));
  });
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <img src={logo} alt="" className="mx-auto h-24 w-24 rounded-3xl" style={{ filter: 'drop-shadow(0 0 30px rgba(196,181,253,.55))' }} />
        <h1 className="mt-4 text-5xl font-bold tracking-[0.3em] text-lilac" style={{ textShadow: '0 0 40px rgba(196,181,253,.5)' }}>LUMA</h1>
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

export default function App() {
  return (
    <StoreProvider>
      <SettingsProvider>
        <WorkspaceProvider>
          <div className="cosmos" />
          <Shell />
        </WorkspaceProvider>
      </SettingsProvider>
    </StoreProvider>
  );
}
