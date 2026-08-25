import { useEffect, useMemo, useState } from 'react';
import type { ConflictFile, DiffFile, StatusEntry } from '@shared/types';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import ConflictModal from '../components/ConflictModal';
import StashDrawer from '../components/StashDrawer';
import { fileBadge } from '../languages';

export default function ChangesView({ onOpenFile }: { onOpenFile: (path: string) => void }) {
  const { status, refresh, setToast } = useStore();
  const [selected, setSelected] = useState<StatusEntry | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState<'stage' | 'unstage' | null>(null);
  const [conflict, setConflict] = useState<ConflictFile | null>(null);
  const [stashOpen, setStashOpen] = useState(false);

  const staged = useMemo(
    () => status?.entries.filter((e) => e.staged && !e.conflicted) ?? [],
    [status]
  );
  const unstaged = useMemo(
    () =>
      status?.entries.filter(
        (e) => (!e.staged || e.conflicted) && (e.unstaged || e.untracked || e.conflicted)
      ) ?? [],
    [status]
  );
  const conflicts = useMemo(() => status?.entries.filter((e) => e.conflicted) ?? [], [status]);

  useEffect(() => {
    if (!selected) {
      setDiff(null);
      return;
    }
    setDiff(null);
    gitCall<DiffFile[]>('diff', selected.staged && !selected.conflicted, selected.path)
      .then(setDiff)
      .catch(() => setDiff([]));
  }, [selected, status]);

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
      if (paths.length) act(() => gitCall(target === 'stage' ? 'stage' : 'unstage', paths));
    };
  }

  async function doCommit() {
    if (!message.trim()) return;
    await act(() => gitCall('commit', message.trim()));
    setMessage('');
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* left rail: lists */}
      <div className="flex w-[340px] shrink-0 flex-col gap-3">
        {conflicts.length > 0 && (
          <div className="glass anim-in border-amber/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-amber">
                Merge conflicts · {conflicts.length}
              </span>
              <button
                className="btn px-2 py-0.5 text-[11px]"
                onClick={() => act(() => gitCall('mergeAbort'))}
              >
                Abort
              </button>
            </div>
            {conflicts.map((c) => (
              <button
                key={c.path}
                className="block w-full truncate rounded-lg bg-amber/10 px-2 py-1.5 text-left font-mono text-xs text-amber hover:bg-amber/20"
                onClick={async () =>
                  setConflict(await gitCall<ConflictFile>('conflictFile', c.path))
                }
              >
                {c.path} — resolve…
              </button>
            ))}
          </div>
        )}

        {/* Working tree */}
        <section
          className={`glass flex min-h-0 flex-1 flex-col overflow-hidden ${dragOver === 'unstage' ? 'drop-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver('unstage');
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('unstage')}
        >
          <header className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Working tree</span>
            <span className="rounded-full bg-white/8 px-1.5 text-[10px] text-white/50">
              {unstaged.length}
            </span>
            <div className="flex-1" />
            {unstaged.length > 0 && (
              <button
                className="text-[10px] text-lilac/80 hover:text-lilac"
                title="Stage everything"
                onClick={() => act(() => gitCall('stageAll'))}
              >
                stage all
              </button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {unstaged.length === 0 && (
              <div className="px-2 py-3 text-xs text-white/30">Clean — nothing unstaged.</div>
            )}
            {unstaged.map((e) => (
              <FileChip
                key={e.path}
                entry={e}
                selected={selected?.path === e.path}
                onClick={() => setSelected(e)}
                onOpenFile={onOpenFile}
                onStage={() => act(() => gitCall('stage', [e.origPath ?? e.path]))}
                onDiscard={() => act(() => gitCall('discard', [e.origPath ?? e.path]))}
              />
            ))}
          </div>
        </section>

        {/* Staged = commit container */}
        <section
          className={`glass flex max-h-[46%] min-h-[150px] flex-col overflow-hidden ${dragOver === 'stage' ? 'drop-active border-teal/60' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver('stage');
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('stage')}
        >
          <header className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-teal">
              ⬡ Commit container
            </span>
            <span className="rounded-full bg-teal/15 px-1.5 text-[10px] text-teal">
              {staged.length}
            </span>
            <div className="flex-1" />
            {staged.length > 0 && (
              <button
                className="text-[10px] text-white/40 hover:text-white/80"
                title="Unstage everything"
                onClick={() =>
                  act(() =>
                    gitCall(
                      'unstage',
                      staged.map((e) => e.path)
                    )
                  )
                }
              >
                unstage all
              </button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {staged.length === 0 && (
              <div className="px-2 py-3 text-xs text-white/30">
                Drag files here, or press + on a file.
              </div>
            )}
            {staged.map((e) => (
              <FileChip
                key={e.path}
                entry={e}
                staged
                selected={selected?.path === e.path}
                onClick={() => setSelected(e)}
                onOpenFile={onOpenFile}
                onUnstage={() => act(() => gitCall('unstage', [e.origPath ?? e.path]))}
              />
            ))}
          </div>
          <div className="border-t border-white/8 p-2.5">
            <textarea
              className="field mb-2 h-14 w-full resize-none text-xs"
              placeholder="Commit message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit();
              }}
            />
            <div className="flex items-center gap-2">
              <button
                className="btn btn-primary flex-1 text-xs"
                disabled={!message.trim() || staged.length === 0}
                onClick={doCommit}
                title="⌘/Ctrl+Enter"
              >
                Commit {staged.length > 0 ? `(${staged.length})` : ''}
              </button>
              <button
                className="btn px-2 py-1 text-[11px]"
                title="Open the stash drawer"
                onClick={() => setStashOpen(true)}
              >
                🗂 Stash
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* right: diff */}
      <div className="glass min-w-0 flex-1 overflow-y-auto p-1">
        {!selected && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <div className="text-4xl opacity-15">±</div>
            <div className="text-sm text-white/40">Select a file to see its changes</div>
            <div className="text-xs text-white/25">
              + stages it · ⟲ discards · drag it into the commit container
            </div>
          </div>
        )}
        {selected && diff === null && <div className="p-6 text-sm text-white/40">Loading…</div>}
        {selected && selected.untracked && diff?.length === 0 && (
          <UntrackedView path={selected.path} />
        )}
        {diff?.map((f) => (
          <DiffView key={f.newPath + f.oldPath} file={f} />
        ))}
        {selected && !selected.untracked && diff?.length === 0 && (
          <div className="p-6 text-sm text-white/40">No textual diff.</div>
        )}
      </div>

      {conflict && (
        <ConflictModal file={conflict} onClose={() => setConflict(null)} onResolved={refresh} />
      )}
      {stashOpen && <StashDrawer onClose={() => setStashOpen(false)} />}
    </div>
  );
}

function FileChip({
  entry,
  selected,
  onClick,
  staged,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
}: {
  entry: StatusEntry;
  selected: boolean;
  onClick: () => void;
  staged?: boolean;
  onOpenFile: (p: string) => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const badge = fileBadge(entry.path);
  return (
    <div
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData(
          'application/luma-paths',
          JSON.stringify([entry.origPath ?? entry.path])
        )
      }
      onClick={onClick}
      title={entry.path}
      className={`group flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 ${selected ? 'bg-lilac/15' : 'hover:bg-white/6'} active:cursor-grabbing`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.conflicted ? 'bg-amber' : staged ? 'bg-teal' : entry.untracked ? 'bg-white/30' : 'bg-rose'}`}
      />
      <span
        className="rounded px-1 text-[8px] font-bold leading-4 shrink-0"
        style={{ color: badge.color, background: `${badge.color}1c` }}
      >
        {badge.label}
      </span>
      <span className="flex-1 truncate font-mono text-xs text-white/80">{entry.path}</span>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onStage && (
          <button
            className="rounded px-1 text-[13px] leading-none text-teal hover:bg-teal/15"
            title="Stage this file (git add)"
            onClick={(e) => {
              e.stopPropagation();
              onStage();
            }}
          >
            +
          </button>
        )}
        {onUnstage && (
          <button
            className="rounded px-1.5 text-[13px] leading-none text-white/60 hover:bg-white/10"
            title="Unstage (git restore --staged)"
            onClick={(e) => {
              e.stopPropagation();
              onUnstage();
            }}
          >
            −
          </button>
        )}
        {onDiscard && !entry.untracked && (
          <button
            className="rounded px-1 text-[12px] leading-none text-rose/80 hover:bg-rose/15"
            title="Discard changes (git checkout --)"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
          >
            ⟲
          </button>
        )}
        <button
          className="rounded px-1 text-[10px] leading-none text-lilac/70 hover:bg-lilac/15"
          title="Open in editor"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFile(entry.path);
          }}
        >
          open
        </button>
      </div>
    </div>
  );
}

function UntrackedView({ path }: { path: string }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    import('../lib/api').then(({ api }) =>
      api.fsRead(path).then((r) => setContent(r.ok ? (r.data ?? null) : null))
    );
  }, [path]);
  return (
    <div className="m-2 overflow-hidden rounded-xl border border-white/8">
      <div className="bg-white/4 px-3 py-2 font-mono text-xs text-white/70">New file: {path}</div>
      <pre className="max-h-[50vh] overflow-auto bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-white/70">
        {content ?? '— binary or unreadable —'}
      </pre>
    </div>
  );
}
