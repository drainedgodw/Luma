import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { SettingsProvider, useSettings } from './settings';
import { WorkspaceProvider, useWorkspace } from './workspace';
import GraphView from './views/GraphView';
import GitHubView from './views/GitHubView';
import IntelligenceView from './views/IntelligenceView';
import ChangesView from './views/ChangesView';
import EditorWorkspace from './views/EditorWorkspace';
import SettingsView from './views/SettingsView';
import StoreView from './views/StoreView';
import RescueView from './views/RescueView';
import RebaseView from './views/RebaseView';
import FileTree, { ExplorerWake } from './components/FileTree';
import EditorTabs from './components/EditorTabs';
import CommandLog from './components/CommandLog';
import Toast from './components/Toast';
import CommandPalette, { type Command } from './components/CommandPalette';
import TerminalPanel from './components/TerminalPanel';
import BisectView from './components/BisectView';
import { Icon } from './components/Icons';
import logo from './assets/logo.png';
import logoMark from './assets/logo-mark.svg';
import { api, gitCall } from './lib/api';

type View = 'editor' | 'graph' | 'changes' | 'github' | 'intelligence' | 'languages' | 'settings' | 'rescue';

function Shell() {
  const { repo, status, openRepo, refresh } = useStore();
  const { openFile } = useWorkspace();
  const { settings, update } = useSettings();
  const [view, setView] = useState<View>('graph');
  const [showLog, setShowLog] = useState(false);
  const [explorerAwake, setExplorerAwake] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [rebaseTarget, setRebaseTarget] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const pinned = settings.explorer === 'pinned';
  const explorerRelevant = view === 'editor';
  const navigate = useCallback((next: View) => {
    if (next !== 'editor') setExplorerAwake(false);
    startTransition(() => setView(next));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => { openFile((event as CustomEvent<string>).detail); navigate('editor'); };
    window.addEventListener('luma:open-file', handler);
    return () => window.removeEventListener('luma:open-file', handler);
  }, [navigate, openFile]);

  useEffect(() => {
    if (repo && localStorage.getItem('luma.onboarding.complete') !== '1') setShowOnboarding(true);
  }, [repo]);

  useEffect(() => {
    if (pinned) setExplorerAwake(false);
  }, [pinned]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); setShowPalette(value => !value); }
      else if (modifier && event.key === '`') { event.preventDefault(); setShowTerminal(value => !value); }
      else if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); update({ explorer: pinned ? 'auto' : 'pinned' }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pinned, update]);

  const commands: Command[] = useMemo(() => {
    const command = (id: string, label: string, group: string, run: () => void | Promise<void>, hint?: string): Command => ({ id, label, group, run, hint });
    const git = (label: string, run: () => Promise<unknown>) => command(`git-${label}`, label, 'Git', async () => { await run(); await refresh(); });
    return [
      command('view-editor', 'Go to Editor', 'View', () => navigate('editor')),
      command('view-graph', 'Go to History / Orbit', 'View', () => navigate('graph')),
      command('view-changes', 'Go to Changes', 'View', () => navigate('changes')),
      command('view-github', 'Go to GitHub repositories', 'View', () => navigate('github')),
      command('view-intelligence', 'Go to Intelligence Center', 'View', () => navigate('intelligence')),
      command('view-rescue', 'Go to Rescue', 'View', () => navigate('rescue')),
      command('show-onboarding', 'Show getting started guide', 'Help', () => setShowOnboarding(true)),
      command('toggle-terminal', 'Toggle Terminal', 'View', () => setShowTerminal(value => !value), 'Ctrl+`'),
      command('toggle-sidebar', 'Toggle Sidebar', 'View', () => update({ explorer: pinned ? 'auto' : 'pinned' }), 'Ctrl+B'),
      command('open-repo', 'Open Repository…', 'File', () => openRepo()),
      git('Fetch from origin', () => gitCall('fetch', 'origin')),
      git('Pull with rebase', () => gitCall('pull')),
      git('Push', () => gitCall('push', !status?.upstream)),
      git('Stage all changes', () => gitCall('stageAll')),
      git('Stash current changes', () => gitCall('stashPush')),
    ];
  }, [navigate, openRepo, pinned, refresh, status?.upstream, update]);

  if (!repo) return <Welcome/>;
  const dirty = status?.entries.length ?? 0;
  const viewKey = rebaseTarget ? `rebase:${rebaseTarget}` : view;
  return <div className="relative flex h-full w-full flex-col">
    <header className="glass mx-3 mt-3 flex h-12 items-center gap-3 px-4" style={{ WebkitAppRegion: 'drag' } as never}>
      <img src={logo} alt="Luma" className="h-7 w-7 rounded-lg"/><span className="text-[14px] font-bold tracking-[.25em] text-lilac">LUMA</span><span className="text-white/20">/</span><span className="truncate font-mono text-xs text-white/65">{repo.split('/').pop()}</span>
      {status?.branch && <span className="rounded-full border border-teal/40 bg-teal/10 px-2 text-[11px] text-teal">⎇ {status.branch}{status.ahead > 0 && ` ↑${status.ahead}`}{status.behind > 0 && ` ↓${status.behind}`}</span>}
      <TrustBadge repo={repo} open={() => navigate('intelligence')}/><div className="flex-1"/>
      <div style={{ WebkitAppRegion: 'no-drag' } as never} className="flex items-center gap-2"><button className="btn text-xs" onClick={() => setShowOnboarding(true)}>Help</button><button className="btn text-xs" onClick={() => setShowPalette(true)}>⌘ Commands</button><button className="btn text-xs" onClick={() => setShowLog(value => !value)}>Log</button><WindowButton title="Minimize" run={() => api.winMin()}>─</WindowButton><WindowButton title="Maximize" run={() => api.winMax()}>▢</WindowButton><WindowButton title="Close" run={() => api.winClose()}>✕</WindowButton></div>
    </header>

    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <nav aria-label="Primary workspace" className="glass flex w-16 flex-col items-center gap-1.5 py-3"><img src={logo} alt="" className="mb-1 h-8 w-8 rounded-xl"/><Dock active={pinned} run={() => update({ explorer: pinned ? 'auto' : 'pinned' })} label="Toggle explorer" text="Panel" icon={<Icon name="panel"/>}/><Dock active={view === 'editor'} run={() => navigate('editor')} label="Code editor" text="Code" icon={<Icon name="code"/>}/><Dock active={view === 'graph'} run={() => navigate('graph')} label="History and Orbit" text="History" icon={<Icon name="graph"/>}/><Dock active={view === 'changes'} run={() => navigate('changes')} label="Working tree and staged changes" text="Changes" icon={<Icon name="changes"/>} badge={dirty ? String(dirty) : null}/><Dock active={view === 'github'} run={() => navigate('github')} label="GitHub repositories" text="GitHub" icon={<b className="text-[10px]">GH</b>}/><Dock active={view === 'intelligence'} run={() => navigate('intelligence')} label="Trust, tests and language tools" text="Trust" icon={<span>◈</span>}/><Dock active={showTerminal} run={() => setShowTerminal(value => !value)} label="Integrated terminal" text="Term" icon={<Icon name="terminal"/>}/><Dock active={view === 'rescue'} run={() => navigate('rescue')} label="Reflog and recovery" text="Rescue" icon={<Icon name="shield"/>}/><Dock active={view === 'languages'} run={() => navigate('languages')} label="Language packs" text="Langs" icon={<Icon name="grid"/>}/><div className="mt-auto"><Dock active={view === 'settings'} run={() => navigate('settings')} label="Settings" text="Setup" icon={<Icon name="gear"/>}/></div></nav>
      <ExplorerWake onWake={() => setExplorerAwake(true)} enabled={!pinned && explorerRelevant}/>{(pinned || explorerRelevant) && <FileTree awake={explorerAwake} onCollapse={() => setExplorerAwake(false)}/>} 
      <main className="flex min-w-0 flex-1 flex-col gap-2">{view === 'editor' && <EditorTabs/>}<div className={`min-h-0 flex-1 ${showTerminal ? 'flex flex-col gap-2' : 'flex flex-col'}`}><div className="min-h-0 flex-1"><div key={viewKey} className="view-surface h-full min-h-0">{rebaseTarget ? <RebaseView targetBranch={rebaseTarget} onClose={() => setRebaseTarget(null)}/> : view === 'graph' ? <GraphView onRebase={setRebaseTarget}/> : view === 'changes' ? <ChangesView onOpenFile={openFile}/> : view === 'github' ? <GitHubView/> : view === 'intelligence' ? <IntelligenceView/> : view === 'languages' ? <StoreView/> : view === 'settings' ? <SettingsView/> : view === 'rescue' ? <RescueView/> : <EditorWorkspace/>}</div></div>{showTerminal && <div className="h-[38%] min-h-[160px]"><TerminalPanel onClose={() => setShowTerminal(false)}/></div>}</div></main>
    </div>
    {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)}/>} {showLog && <CommandLog onClose={() => setShowLog(false)}/>} {status?.state === 'bisect' && <BisectView active onClose={() => {}}/>}<Toast/>{showOnboarding && <Onboarding close={() => { localStorage.setItem('luma.onboarding.complete', '1'); setShowOnboarding(false); }} go={(next) => { navigate(next); setShowOnboarding(false); }}/>} 
  </div>;
}

function TrustBadge({ repo, open }: { repo: string; open: () => void }) {
  const [trusted, setTrusted] = useState<boolean | null>(null);
  useEffect(() => { let active = true; void api.intelInvoke('trustStatus').then(result => { if (active) setTrusted(result.ok ? Boolean(result.data) : false); }); const timer = window.setInterval(() => { void api.intelInvoke('trustStatus').then(result => { if (active && result.ok) setTrusted(Boolean(result.data)); }); }, 3000); return () => { active = false; window.clearInterval(timer); }; }, [repo]);
  return <button style={{ WebkitAppRegion: 'no-drag' } as never} onClick={open} title="Open Workspace Trust settings" className={`rounded-full border px-2 py-0.5 text-[10px] ${trusted ? 'border-teal/40 bg-teal/10 text-teal' : 'border-amber/50 bg-amber/10 text-amber'}`}>{trusted ? 'Trusted workspace' : 'Restricted workspace'}</button>;
}

function Onboarding({ close, go }: { close: () => void; go: (view: View) => void }) {
  return <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 p-8"><div className="glass w-full max-w-3xl p-6"><div className="flex items-start"><div><div className="text-xl font-semibold text-lilac">See what Git will do before it does it.</div><div className="mt-1 text-sm text-white/55">Luma is a visual Git workspace. Start with these four workflows.</div></div><div className="flex-1"/><button className="btn" onClick={close}>Close</button></div><div className="mt-6 grid grid-cols-2 gap-3"><Guide number="1" title="Understand history" text="Open History, choose Lanes or Orbit, then select a commit to inspect its diff." run={() => go('graph')}/><Guide number="2" title="Preview before applying" text="Merge, rebase and rollback actions now show a read-only preview before Apply." run={() => go('graph')}/><Guide number="3" title="Trust deliberately" text="Tasks and Terminal stay blocked until you trust the repository. Git hooks still require caution." run={() => go('intelligence')}/><Guide number="4" title="Recover mistakes" text="Rollback creates checkpoints. Rescue and Undo rollback return to earlier states with dirty-tree protection." run={() => go('rescue')}/></div><div className="mt-5 rounded-xl border border-amber/25 bg-amber/5 p-3 text-xs text-white/55">Developer Preview: use a remote backup for important repositories. Prototype language tools are textual, not a semantic LSP.</div></div></div>;
}

function Guide({ number, title, text, run }: { number: string; title: string; text: string; run: () => void }) { return <button className="rounded-xl border border-white/10 p-4 text-left hover:border-lilac/40 hover:bg-lilac/5" onClick={run}><span className="text-xs text-lilac">{number}</span><div className="mt-1 text-sm font-medium">{title}</div><div className="mt-1 text-xs leading-5 text-white/45">{text}</div></button>; }
function WindowButton({ title, run, children }: { title: string; run: () => void; children: React.ReactNode }) { return <button aria-label={title} title={title} onClick={run} className="flex h-8 w-9 items-center justify-center rounded-lg text-[11px] text-white/60 hover:bg-white/10">{children}</button>; }
function Dock({ active, run, label, icon, text, badge }: { active: boolean; run: () => void; label: string; icon: React.ReactNode; text: string; badge?: string | null }) { return <button aria-label={label} title={label} onClick={run} className={`relative flex h-[54px] w-12 flex-col items-center justify-center rounded-xl border ${active ? 'border-lilac/50 bg-lilac/15 text-lilac' : 'border-transparent text-white/55 hover:bg-white/5'}`}>{icon}<span className="text-[9px] opacity-80">{text}</span>{badge && <span className="absolute -right-1 -top-1 rounded-full bg-teal px-1 text-[10px] text-void">{badge}</span>}</button>; }

function Welcome() {
  const { openRepo } = useStore();
  const [recent, setRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    let active = true;
    void api.recentRepos().then((paths) => {
      if (!active) return;
      setRecent(paths);
      setSelected(paths.length ? 0 : -1);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!recent.length) return;
      if (event.target instanceof Element && event.target.closest('button, input, textarea, select')) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setSelected((current) => current < 0 ? (direction > 0 ? 0 : recent.length - 1) : (current + direction + recent.length) % recent.length);
      } else if (event.key === 'Enter' && selected >= 0) {
        event.preventDefault();
        void openRepo(recent[selected]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openRepo, recent, selected]);

  return <div className="welcome-shell flex h-full p-3"><section className="welcome-surface flex h-full w-full flex-col items-center justify-center gap-6 p-8"><img src={logoMark} alt="Luma" className="welcome-logo h-24 w-24 object-contain"/><div className="text-center"><h1 className="text-5xl font-bold tracking-[.3em] text-lilac">LUMA</h1><p className="mt-3 text-white/60">See what Git will do before it does it.</p><p className="mt-1 text-xs text-white/35">Visual history · previewable operations · recoverable mistakes</p></div><button className="btn btn-primary px-8 py-3" onClick={() => openRepo()}>Open directory</button>{recent.length > 0 && <div className="welcome-recents w-full max-w-xl p-3" role="listbox" aria-label="Recent directories"><div className="mb-2 flex items-center px-2 text-[10px] uppercase tracking-wider text-white/35"><span>Recent directories</span><span className="ml-auto normal-case tracking-normal text-white/25">↑ ↓ select · Enter open</span></div>{recent.map((path, index) => <button className="welcome-recent-row flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left" data-selected={selected === index ? 'true' : 'false'} role="option" aria-selected={selected === index} key={path} onMouseEnter={() => setSelected(index)} onClick={() => openRepo(path)}><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-white/75">{directoryName(path)}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-white/35">{path}</span></span><span className="text-[11px] text-white/25">↵</span></button>)}</div>}<div className="text-[10px] text-amber">Developer Preview · keep a remote backup</div></section></div>;
}

function directoryName(path: string): string {
  const clean = path.replace(/[\\/]+$/, '');
  return clean.split(/[\\/]/).pop() || path;
}

export default function App() { return <StoreProvider><SettingsProvider><WorkspaceProvider><Wallpaper/><div className="cosmos"/><Shell/></WorkspaceProvider></SettingsProvider></StoreProvider>; }
function Wallpaper() { const { settings } = useSettings(); const [url, setUrl] = useState<string | null>(null); useEffect(() => { if (settings.theme === 'liquid') void api.wallpaper().then(setUrl); else setUrl(null); }, [settings.theme]); return url ? <div className="wallpaper" style={{ backgroundImage: `url(${url})` }}/> : null; }
