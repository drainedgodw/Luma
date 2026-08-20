import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';

type Task = { id: string; label: string; command: string; args: string[] };
type Match = { path: string; row: number; text: string };
type Capsule = { id: string; name: string; branch?: string; commit?: string; tabs: string[]; active?: string | null; terminalOpen: boolean; note: string; at: number };

export default function IntelligenceView() {
  const { status, setToast, refresh } = useStore();
  const { tabs, active, openFile } = useWorkspace();
  const [trusted, setTrusted] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [output, setOutput] = useState('');
  const [operation, setOperation] = useState<'merge' | 'rebase' | 'reset'>('merge');
  const [ref, setRef] = useState('main');
  const [symbol, setSymbol] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [note, setNote] = useState('');
  const [capsules, setCapsules] = useState<Capsule[]>([]);

  async function call<T>(method: string, ...args: unknown[]): Promise<T> {
    const result = await api.intelInvoke(method, ...args);
    if (!result.ok) throw new Error(result.error?.message ?? 'Intelligence operation failed');
    return result.data as T;
  }

  function reload() {
    void call<boolean>('trustStatus').then(setTrusted).catch(() => setTrusted(false));
    void call<Task[]>('tasks').then(setTasks).catch(() => setTasks([]));
    void call<Capsule[]>('capsules').then(setCapsules).catch(() => setCapsules([]));
  }

  useEffect(reload, []);

  async function run(fn: () => Promise<void>) {
    try { await fn(); } catch (error) { setToast((error as Error).message); }
  }

  async function basicCheck() {
    if (!active) { setOutput('Open a file first.'); return; }
    const result = await api.fsRead(active);
    if (!result.ok) { setOutput(result.error?.message ?? 'Read failed'); return; }
    const text = result.data ?? '';
    const issues: string[] = [];
    if (active.endsWith('.json')) {
      try { JSON.parse(text); } catch (error) { issues.push(`JSON: ${(error as Error).message}`); }
    }
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    for (const char of text) {
      if (pairs[char]) stack.push(pairs[char]);
      else if (Object.values(pairs).includes(char) && stack.pop() !== char) { issues.push(`Possible unbalanced delimiter: ${char}`); break; }
    }
    if (stack.length) issues.push(`Possible missing delimiter: ${stack.at(-1)}`);
    text.split('\n').forEach((line, index) => { if (/TODO|FIXME/.test(line)) issues.push(`${index + 1}: TODO/FIXME`); });
    setOutput(issues.length ? `Basic checks · ${active}\n${issues.join('\n')}` : `Basic checks · ${active}\nNo issues found by the limited delimiter/JSON checker. This is not an LSP result.`);
  }

  return <div className="glass h-full overflow-y-auto p-5"><div className="mx-auto flex max-w-4xl flex-col gap-5">
    <header><div className="text-sm font-semibold">Luma Intelligence Center</div><div className="text-xs text-white/35">Trust · local tests · operation preview · experimental text tools · workspace snapshots</div></header>

    <section className="glass-soft p-4"><div className="flex items-center justify-between gap-4"><div><b>Workspace Trust</b><div className="text-xs text-white/35">Tasks and the integrated terminal are disabled until this repository is trusted. Git hooks may still execute during Git operations.</div></div><div className="flex gap-2"><button className="btn text-teal" onClick={() => run(async () => { const result = await call<{ ref: string; safety: string; stashed: boolean }>('undoRollback'); await refresh(); setToast(`Restored ${result.ref}; safety branch ${result.safety}${result.stashed ? '; local changes stashed' : ''}`); })}>Undo last rollback</button><button className={`btn ${trusted ? 'text-teal' : 'text-amber'}`} onClick={() => run(async () => setTrusted(await call('setTrust', !trusted)))}>{trusted ? 'Trusted ✓' : 'Trust repository'}</button></div></div></section>

    <section className="glass-soft p-4"><b>Tasks / Local Test Center</b><div className="mt-1 text-xs text-white/35">Results are stored against the current commit SHA. They are local results, not GitHub CI status.</div><div className="mt-3 flex flex-wrap gap-2">{tasks.map(task => <button className="btn text-xs" key={task.id} disabled={!trusted} onClick={() => run(async () => { setOutput('Running…'); const result = await call<{ ok: boolean; output: string; sha: string }>('runTask', task); setOutput(`${result.ok ? 'PASS' : 'FAIL'} · ${result.sha.slice(0, 8)}\n${result.output}`); })}>{task.label}</button>)}</div>{output && <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-black/25 p-3 text-[11px] text-white/60">{output}</pre>}</section>

    <section className="glass-soft p-4"><b>Operation Preview <span className="text-[10px] font-normal text-amber">EXPERIMENTAL</span></b><div className="mt-1 text-xs text-white/35">Read-only analysis. Rebase preview lists commits; it does not yet simulate a language-aware conflict resolution.</div><div className="mt-3 flex gap-2"><select className="field" value={operation} onChange={event => setOperation(event.target.value as typeof operation)}><option value="merge">Merge</option><option value="rebase">Rebase</option><option value="reset">Reset</option></select><input className="field flex-1" value={ref} onChange={event => setRef(event.target.value)} placeholder="branch / commit"/><button className="btn" onClick={() => run(async () => { const result = await call<{ summary: string; conflicts?: boolean }>('preview', operation, ref); setOutput(`${result.conflicts ? 'POSSIBLE CONFLICTS' : 'READ-ONLY PREVIEW'}\n${result.summary}`); })}>Preview only</button></div></section>

    <section className="glass-soft p-4"><b>Language tools <span className="text-[10px] font-normal text-amber">PROTOTYPE</span></b><div className="text-xs text-white/35">Editor autocomplete is syntax-based. The checks below are not protocol-based LSP. Symbol search uses Git text search; replacement is textual and may affect comments or strings.</div><div className="mt-3 flex flex-wrap gap-2"><button className="btn" onClick={basicCheck}>Basic check active file</button><input className="field min-w-32 flex-1" value={symbol} onChange={event => setSymbol(event.target.value)} placeholder="symbol text"/><button className="btn" onClick={() => run(async () => setMatches(await call('symbols', symbol)))}>Find text matches</button><input className="field min-w-32 flex-1" value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="replace with"/><button className="btn text-amber" disabled={!trusted || !matches.length || !replacement} onClick={() => run(async () => { if (!window.confirm(`Experimental textual replacement: replace ${matches.length} displayed match(es) of “${symbol}” with “${replacement}”? Review the Git diff immediately afterward.`)) return; const result = await call<{ files: number; matches: number }>('rename', symbol, replacement); setToast(`Text replaced in ${result.files} files; review Changes before committing`); })}>Text replace</button></div><div className="mt-2 max-h-40 overflow-auto">{matches.map((match, index) => <button key={`${match.path}:${match.row}:${index}`} className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] hover:bg-white/5" onClick={() => openFile(match.path)}>{match.path}:{match.row} · {match.text}</button>)}</div></section>

    <section className="glass-soft p-4"><b>Workspace snapshots <span className="text-[10px] font-normal text-amber">PROTOTYPE</span></b><div className="text-xs text-white/35">Stores tabs, active file, branch metadata, note and terminal open/closed state. Live PTY processes and command history are not restored.</div><textarea className="field mt-2 h-16 w-full" value={note} onChange={event => setNote(event.target.value)} placeholder="What are you working on?"/><button className="btn btn-primary mt-2" onClick={() => run(async () => { await call('saveCapsule', { name: note.slice(0, 40) || `Workspace ${new Date().toLocaleString()}`, branch: status?.branch, tabs: tabs.map(tab => tab.path), active, terminalOpen: localStorage.getItem('luma.terminalOpen') === '1', note }); setNote(''); reload(); })}>Save workspace snapshot</button><div className="mt-3 grid gap-2">{capsules.map(capsule => <button className="rounded-xl border border-white/10 p-3 text-left hover:bg-white/5" key={capsule.id} onClick={() => { capsule.tabs.forEach(openFile); setNote(capsule.note); const current = localStorage.getItem('luma.terminalOpen') === '1'; if (current !== capsule.terminalOpen) window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true })); }}><div className="text-xs">{capsule.name}</div><div className="text-[10px] text-white/35">{capsule.branch ?? 'detached'} · {capsule.tabs.length} tabs · terminal {capsule.terminalOpen ? 'open' : 'closed'} · {new Date(capsule.at).toLocaleString()}</div></button>)}</div></section>
  </div></div>;
}
