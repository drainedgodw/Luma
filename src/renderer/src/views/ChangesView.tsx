import { useEffect, useMemo, useState } from 'react';
import type { ConflictFile, DiffFile, StatusEntry } from '@shared/types';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import ConflictModal from '../components/ConflictModal';

export default function ChangesView({ onOpenFile }: { onOpenFile: (path: string) => void }) {
  const { status, refresh, setToast } = useStore();
  const [selectedFile, setSelectedFile] = useState<StatusEntry | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState<'stage' | 'unstage' | null>(null);
  const [conflict, setConflict] = useState<ConflictFile | null>(null);

  const staged = useMemo(() => status?.entries.filter((e) => e.staged && !e.conflicted) ?? [], [status]);
  const unstaged = useMemo(() => status?.entries.filter((e) => (!e.staged || e.conflicted) && (e.unstaged || e.untracked || e.conflicted)) ?? [], [status]);
  const conflicts = useMemo(() => status?.entries.filter((e) => e.conflicted) ?? [], [status]);

  useEffect(() => {
    if (selectedFile) {
      setDiff(null);
      gitCall<DiffFile[]>('diff', false, selectedFile.path).then(setDiff).catch(() => setDiff([]));
    } else {
      setDiff(null);
    }
  }, [selectedFile, status]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  function onDrop(target: 'stage' | 'unstage') {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const paths: string[] = JSON.parse(e.dataTransfer.getData('application/luma-paths') || '[]');
      if (paths.length === 0) return;
      act(() => gitCall(target === 'stage' ? 'stage' : 'unstage', paths));
    };
  }

  async function doCommit() {
    if (!message.trim()) return;
    await act(() => gitCall('commit', message.trim()));
    setMessage('');
  }

  return (
    <div className="flex h-full gap-3">
      {/* left: file columns */}
      <div className="flex w-[420px] shrink-0 flex-col gap-3">
        {conflicts.length > 0 && (
          <div className="glass anim-in border-amber/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-amber">Merge conflicts</span>
              <button className="btn text-[11px]" onClick={() => act(() => gitCall('mergeAbort'))}>Abort merge</button>
            </div>
            {conflicts.map((c) => (
              <button key={c.path} className="block w-full truncate rounded-lg bg-amber/10 px-2 py-1.5 text-left font-mono text-xs text-amber hover:bg-amber/20"
                onClick={async () => setConflict(await gitCall<ConflictFile>('conflictFile', c.path))}>
                {c.path} — resolve…
              </button>
            ))}
          </div>
        )}

        {/* Unstaged (source) */}
        <div
          className={`glass flex min-h-0 flex-1 flex-col overflow-hidden ${dragOver === 'unstage' ? 'drop-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver('unstage'); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('unstage')}
        >
          <div className="border-b border-white/8 px-3 py-2 text-[11px] uppercase tracking-wider text-white/40">
            Working tree <span className="ml-1 text-white/30">drag →</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {unstaged.length === 0 && <div className="px-2 py-3 text-xs text-white/35">Clean. Nothing unstaged.</div>}
            {unstaged.map((e) => <FileRow key={e.path} entry={e} selected={selectedFile?.path === e.path} onClick={() => setSelectedFile(e)} onOpenFile={onOpenFile} />)}
          </div>
        </div>

        {/* Staged = commit container */}
        <div
          className={`glass flex max-h-[45%] min-h-[140px] flex-col overflow-hidden ${dragOver === 'stage' ? 'drop-active border-teal/60' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver('stage'); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('stage')}
        >
          <div className="border-b border-white/8 px-3 py-2 text-[11px] uppercase tracking-wider text-teal">
            ⬡ Commit container <span className="text-white/30">— drop here</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {staged.length === 0 && <div className="px-2 py-3 text-xs text-white/35">Drag files here to stage them.</div>}
            {staged.map((e) => <FileRow key={e.path} entry={e} selected={selectedFile?.path === e.path} onClick={() => setSelectedFile(e)} staged onOpenFile={onOpenFile} />)}
          </div>
          <div className="border-t border-white/8 p-2.5">
            <textarea className="field mb-2 h-16 w-full resize-none text-xs" placeholder="Commit message…" value={message}
              onChange={(e) => setMessage(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1 text-xs" disabled={!message.trim() || staged.length === 0} onClick={doCommit}>Commit</button>
              <button className="btn text-xs" title="git stash push" onClick={() => act(() => gitCall('stashPush'))}>Stash</button>
            </div>
          </div>
        </div>
      </div>

      {/* right: diff */}
      <div className="glass min-w-0 flex-1 overflow-y-auto p-1">
        {!selectedFile && <div className="p-6 text-sm text-white/40">Select a file to see changes, or drag it between containers.</div>}
        {selectedFile && diff === null && <div className="p-6 text-sm text-white/40">Loading…</div>}
        {selectedFile && selectedFile.untracked && diff?.length === 0 && (
          <UntrackedView path={selectedFile.path} />
        )}
        {diff?.map((f) => <DiffView key={f.newPath + f.oldPath} file={f} />)}
        {selectedFile && !selectedFile.untracked && diff?.length === 0 && diff !== null && (
          <div className="p-6 text-sm text-white/40">No textual diff.</div>
        )}
      </div>

      {conflict && <ConflictModal file={conflict} onClose={() => setConflict(null)} onResolved={refresh} />}
    </div>
  );
}

function FileRow({ entry, selected, onClick, staged, onOpenFile }: { entry: StatusEntry; selected: boolean; onClick: () => void; staged?: boolean; onOpenFile: (p: string) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/luma-paths', JSON.stringify([entry.origPath ?? entry.path]))}
      className={`group flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 ${selected ? 'bg-lilac/15' : 'hover:bg-white/6'} active:cursor-grabbing`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.conflicted ? 'bg-amber' : staged ? 'bg-teal' : entry.untracked ? 'bg-white/30' : 'bg-rose'}`} />
      <span className="flex-1 truncate font-mono text-xs text-white/80" title={entry.path} onClick={onClick}>{entry.path}</span>
      <span className="text-[10px] text-white/30">{entry.x}{entry.y === '?' ? '' : entry.y}</span>
      <button
        className="hidden shrink-0 rounded px-1 text-[10px] text-lilac/70 hover:text-lilac group-hover:block"
        title="Open in editor"
        onClick={(e) => {
          e.stopPropagation();
          onOpenFile(entry.path);
        }}
      >
        open
      </button>
    </div>
  );
}

function UntrackedView({ path }: { path: string }) {
  const { setToast } = useStore();
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    import('../lib/api').then(({ api }) => api.fsRead(path).then((r) => setContent(r.ok ? r.data ?? null : null)));
  }, [path]);
  return (
    <div className="m-2 overflow-hidden rounded-xl border border-white/8">
      <div className="bg-white/4 px-3 py-2 font-mono text-xs text-white/70">New file: {path}</div>
      <pre className="max-h-[50vh] overflow-auto bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-white/70" onClick={() => setToast(null)}>
        {content ?? '— binary or unreadable —'}
      </pre>
    </div>
  );
}
