import { useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { SettingsProvider, useSettings } from './settings';
import { WorkspaceProvider, useWorkspace } from './workspace';
import GraphView from './views/GraphView';
import ChangesView from './views/ChangesView';
import EditorWorkspace from './views/EditorWorkspace';
import SettingsView from './views/SettingsView';
import StoreView from './views/StoreView';
import RescueView from './views/RescueView';
import RebaseView from './views/RebaseView';
import BridgesView from './views/BridgesView';
import FileTree from './components/FileTree';
import { ExplorerWake } from './components/FileTree';
import EditorTabs from './components/EditorTabs';
import CommandLog from './components/CommandLog';
import Toast from './components/Toast';
import CommandPalette, { type Command } from './components/CommandPalette';
import TerminalPanel from './components/TerminalPanel';
import BisectView from './views/BisectView';
import { Icon } from './components/Icons';
import logo from './assets/logo.png';
import { api as lumaApi, gitCall } from './lib/api';

type View = 'editor' | 'graph' | 'changes' | 'bridges' | 'languages' | 'settings' | 'rescue';

function Shell() {
  const { repo, status, openRepo, refresh, setToast } = useStore();
  const { openFile } = useWorkspace();
  const { settings, update } = useSettings();
  const [view, setView] = useState<View>('graph');
  const [showLog, setShowLog] = useState(false);
  const [explorerAwake, setExplorerAwake] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [rebaseTarget, setRebaseTarget] = useState<string | null>(null);
  const pinned = settings.explorer === 'pinned';

  useEffect(() => {
    const onOpenFile = (e: Event) => {
      openFile((e as CustomEvent<string>).detail);
      setView('editor');
    };
    window.addEventListener('luma:open-file', onOpenFile);
    return () => window.removeEventListener('luma:open-file', onOpenFile);
  }, [openFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowPalette((v) => !v);
      } else if (mod && e.key === '`') {
        e.preventDefault();
        setShowTerminal((v) => !v);
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        update({ explorer: settings.explorer === 'pinned' ? 'auto' : 'pinned' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.explorer, update]);

  const commands: Command[] = useMemo(() => {
    const cmd = (id: string, label: string, group: string, run: () => void | Promise<void>, hint?: string): Command => ({ id, label, group, run, hint });
    const gitAction = (label: string, fn: () => Promise<unknown>, group = 'Git') =>
      cmd(`git-${label}`, label, group, async () => {
        await fn();
        await refresh();
      });
    return [
      cmd('view-editor', 'Go to Editor', 'View', () => setView('editor')),
      cmd('view-graph', 'Go to Commit History', 'View', () => setView('graph')),
      cmd('view-changes', 'Go to Changes', 'View', () => setView('changes')),
      cmd('view-bridges', 'Go to Bridges (PR view)', 'View', () => setView('bridges')),
      cmd('view-languages', 'Go to Languages', 'View', () => setView('languages')),
      cmd('view-settings', 'Go to Settings', 'View', () => setView('settings')),
      cmd('view-rescue', 'Go to Rescue (reflog)', 'View', () => setView('rescue')),
      cmd('toggle-terminal', 'Toggle Terminal', 'View', () => setShowTerminal((v) => !v), 'Ctrl+`'),
      cmd('toggle-sidebar', 'Toggle Sidebar', 'View', () => update({ explorer: settings.explorer === 'pinned' ? 'auto' : 'pinned' }), 'Ctrl+B'),
      cmd('toggle-theme', `Switch theme (now: ${settings.theme === 'cosmos' ? 'Cosmos' : 'Liquid Glass'})`, 'View', () => update({ theme: settings.theme === 'cosmos' ? 'liquid' : 'cosmos' })),
      cmd('open-repo', 'Open Repository…', 'File', () => openRepo()),
      gitAction('Fetch from origin', () => gitCall('fetch', 'origin')),
      gitAction('Pull (rebase)', () => gitCall('pull')),
      gitAction('Push', () => gitCall('push', !status?.upstream)),
      gitAction('Stage all changes', () => gitCall('stageAll')),
      gitAction('Stash current changes', () => gitCall('stashPush')),
      gitAction('Pop latest stash', () => gitCall('stashPop')),
      gitAction('Abort merge', () => gitCall('mergeAbort'), 'Recovery'),
      gitAction('Abort rebase', () => gitCall('rebaseAbort'), 'Recovery'),
      gitAction('Reset bisect', () => gitCall('bisectReset'), 'Recovery'),
    ];
  }, [openRepo, refresh, status?.upstream, settings.explorer, settings.theme, update]);

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
          <button className="btn text-xs" title="Command palette" onClick={() => setShowPalette(true)}>⌘ Commands</button>
          <button className="btn text-xs" title="Show the git commands Luma runs for you" onClick={() => setShowLog((v) => !v)}>Log</button>
          <div className="ml-1 flex items-center">
            <WinBtn title="Minimize" onClick={() => lumaApi.winMin()}>─</WinBtn>
            <WinBtn title="Maximize" onClick={() => lumaApi.winMax()}>▢</WinBtn>
            <WinBtn title="Close" onClick={() => lumaApi.winClose()} danger>✕</WinBtn>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Dock */}
          <nav className="glass flex w-14 flex-col items-center gap-1.5 py-3">
            <img src={logo} alt="Luma" className="mb-1 h-8 w-8 rounded-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(196,181,253,.4))' }} />
            <div className="mb-1 h-px w-8 bg-white/10" />
            <DockBtn
              active={pinned}
              onClick={() => update({ explorer: pinned ? 'auto' : 'pinned' })}
              label={pinned ? 'Hide sidebar (slides out on hover)' : 'Show sidebar permanently'}
              text="Panel"
              icon={<Icon name="panel" />}
            />
            <DockBtn active={view === 'editor'} onClick={() => setView('editor')} label="Editor" text="Editor" icon={<Icon name="code" />} />
            <DockBtn active={view === 'graph'} onClick={() => setView('graph')} label="Commit History" text="History" icon={<Icon name="graph" />} />
            <DockBtn active={view === 'changes'} onClick={() => setView('changes')} label="Changes" text="Changes" icon={<Icon name="changes" />} badge={dirtyCount > 0 ? String(dirtyCount > 99 ? '99+' : dirtyCount) : null} />
            <DockBtn active={view === 'bridges'} onClick={() => setView('bridges')} label="Bridges — every branch is a PR into the base branch" text="Bridges" icon={<Icon name="bridge" />} />
            <DockBtn active={showTerminal} onClick={() => setShowTerminal((v) => !v)} label="Terminal (Ctrl+`)" text="Term" icon={<Icon name="terminal" />} />
            <DockBtn active={view === 'rescue'} onClick={() => setView('rescue')} label="Rescue — undo anything with reflog" text="Rescue" icon={<Icon name="shield" />} />
            <DockBtn active={view === 'languages'} onClick={() => setView('languages')} label="Language packs" text="Langs" icon={<Icon name="grid" />} />
            <div className="mt-auto flex flex-col gap-1.5">
              <DockBtn active={view === 'settings'} onClick={() => setView('settings')} label="Settings" text="Setup" icon={<Icon name="gear" />} />
              <DockBtn active={false} onClick={() => openRepo()} label="Open repository" text="Open" icon={<Icon name="folder" />} />
            </div>
          </nav>

          <ExplorerWake onWake={() => setExplorerAwake(true)} enabled={!pinned} />
          <FileTree awake={explorerAwake} onCollapse={() => setExplorerAwake(false)} />

          <main className="flex min-w-0 flex-1 flex-col gap-2">
            {view === 'editor' && <EditorTabs />}
            <div className={`min-h-0 flex-1 ${showTerminal ? 'flex flex-col gap-2' : 'flex flex-col'}`}>
              <div className="min-h-0 flex-1">
                {rebaseTarget ? (
                  <RebaseView targetBranch={rebaseTarget} onClose={() => setRebaseTarget(null)} />
                ) : view === 'graph' ? <GraphView onRebase={(b) => setRebaseTarget(b)} /> : view === 'changes' ? <ChangesView onOpenFile={openFile} /> : view === 'bridges' ? <BridgesView onRebase={(b) => setRebaseTarget(b)} /> : view === 'languages' ? <StoreView /> : view === 'settings' ? <SettingsView /> : view === 'rescue' ? <RescueView /> : <EditorWorkspace />}
              </div>
              {showTerminal && (
                <div className="h-[38%] min-h-[160px]">
                  <TerminalPanel onClose={() => setShowTerminal(false)} />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />}
      {showLog && <CommandLog onClose={() => setShowLog(false)} />}
      {status?.state === 'bisect' && <BisectView active onClose={() => {}} />}
      <Toast />
    </div>
  );
}

function WinBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-9 items-center justify-center rounded-lg text-[11px] transition-colors ${
        danger ? 'text-white/60 hover:bg-rose hover:text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function DockBtn({ active, onClick, label, icon, text, badge }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode; text?: string; badge?: string | null }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`relative flex h-[52px] w-11 flex-col items-center justify-center gap-0.5 rounded-xl border transition-all duration-200 ${
        active
          ? 'border-lilac/50 bg-lilac/15 text-lilac shadow-[0_0_16px_rgba(196,181,253,0.25)]'
          : 'border-transparent text-white/45 hover:border-white/10 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {icon}
      {text && <span className="text-[8px] tracking-wide opacity-70">{text}</span>}
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
          <Wallpaper />
          <div className="cosmos" />
          <Shell />
        </WorkspaceProvider>
      </SettingsProvider>
    </StoreProvider>
  );
}

/** Liquid theme renders the user's real desktop wallpaper under everything. */
function Wallpaper() {
  const { settings } = useSettings();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (settings.theme === 'liquid') {
      import('./lib/api').then(({ api }) => api.wallpaper().then((u) => setUrl(u)));
    } else {
      setUrl(null);
    }
  }, [settings.theme]);
  if (!url) return null;
  return <div className="wallpaper" style={{ backgroundImage: `url(${url})` }} />;
}
