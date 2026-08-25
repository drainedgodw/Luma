import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Commit } from '@shared/types';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import { Icon } from '../components/Icons';

type RebaseAction = 'pick' | 'squash' | 'drop' | 'edit' | 'reword';

interface TodoItem {
  hash: string;
  shortHash: string;
  message: string;
  action: RebaseAction;
  author: string;
  timestamp: number;
}

const ACTION_STYLES: Record<RebaseAction, { label: string; color: string; bg: string }> = {
  pick: { label: 'pick', color: '#4fd1c5', bg: 'rgba(79,209,197,.12)' },
  squash: { label: 'squash', color: '#c084fc', bg: 'rgba(192,132,252,.12)' },
  drop: { label: 'drop', color: '#f56565', bg: 'rgba(245,101,101,.10)' },
  edit: { label: 'edit', color: '#f6ad55', bg: 'rgba(246,165,85,.12)' },
  reword: { label: 'reword', color: '#63b3ed', bg: 'rgba(99,179,237,.12)' },
};

const ACTION_CYCLE: RebaseAction[] = ['pick', 'squash', 'edit', 'reword', 'drop'];

export default function RebaseView({
  targetBranch,
  onClose,
}: {
  targetBranch: string;
  onClose: () => void;
}) {
  const { commits, refresh, setToast, status } = useStore();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dragIdx = useRef<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editMsg, setEditMsg] = useState('');

  const currentBranch = status?.branch;

  // Load commits between targetBranch and HEAD
  const midRebase = status?.state === 'rebase';
  useEffect(() => {
    if (midRebase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    gitCall<Commit[]>('commitRange', targetBranch, 'HEAD')
      .then((range) => {
        setTodos(
          // git log yields newest first; a rebase todo applies oldest first
          [...range].reverse().map((c) => ({
            hash: c.hash,
            shortHash: c.shortHash,
            message: c.message,
            action: 'pick' as RebaseAction,
            author: c.author,
            timestamp: c.timestamp,
          }))
        );
      })
      .catch((e) => setToast((e as Error).message))
      .finally(() => setLoading(false));
  }, [targetBranch, midRebase, setToast]);

  // squashCount/effective computed below; conflict state also flips when git
  // reports a conflicted rebase mid-run
  useEffect(() => {
    if (status?.state === 'merge') {
      const hasConflict = status?.entries?.some((e) => e.conflicted);
      if (hasConflict) setConflict(true);
    } else if (status?.state !== 'rebase') {
      setConflict(false);
    }
  }, [status]);

  const conflictNow = midRebase || conflict;

  const squashCount = useMemo(() => todos.filter((t) => t.action === 'squash').length, [todos]);
  const effectiveCount = useMemo(
    () => todos.filter((t) => t.action !== 'drop').length - squashCount,
    [todos, squashCount]
  );

  function cycleAction(idx: number) {
    setTodos((prev) => {
      const copy = [...prev];
      const cur = copy[idx].action;
      const next = ACTION_CYCLE[(ACTION_CYCLE.indexOf(cur) + 1) % ACTION_CYCLE.length];
      copy[idx] = { ...copy[idx], action: next };
      return copy;
    });
  }

  function removeDrop(idx: number) {
    setTodos((prev) => prev.filter((_, i) => i !== idx));
  }

  // Drag-and-drop reorder
  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setTodos((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIdx.current!, 1);
      copy.splice(idx, 0, moved);
      dragIdx.current = idx;
      return copy;
    });
  }

  function onDragEnd() {
    dragIdx.current = null;
  }

  async function executeRebase() {
    setRunning(true);
    setConfirmAbort(false);
    try {
      const todoItems = todos
        .filter((t) => t.action !== 'drop')
        .map((t) => ({
          hash: t.hash,
          command: t.action,
          message: t.message,
          shortHash: t.shortHash,
        }));
      await gitCall('interactiveRebase', targetBranch, todoItems);
      await refresh();
      onClose();
      setToast('Rebase complete');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes('conflict')) {
        setConflict(true);
        await refresh();
        setToast('Conflict during rebase — resolve in Changes, then continue');
      } else {
        setToast(msg);
      }
    } finally {
      setRunning(false);
    }
  }

  async function continueRebase() {
    try {
      await gitCall('rebaseContinue');
      const s =
        await gitCall<typeof status extends undefined ? never : import('@shared/types').GitStatus>(
          'status'
        );
      await refresh();
      if (s.state !== 'rebase') {
        onClose();
        setToast('Rebase complete');
      } else {
        setToast('Step applied — keep going');
      }
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  async function abortRebase() {
    try {
      await gitCall('rebaseAbort');
      await refresh();
      setConflict(false);
      setConfirmAbort(false);
      onClose();
      setToast('Rebase aborted');
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  // Make dragging keyboard accessible
  const moveItem = useCallback((idx: number, dir: -1 | 1) => {
    setTodos((prev) => {
      const copy = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= copy.length) return prev;
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }, []);

  if (loading) {
    return (
      <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-full items-center justify-center gap-2">
          <span className="text-white/40">Loading commits for rebase…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <Icon name="graph" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white/85">Interactive Rebase</div>
          <div className="text-[11px] text-white/40">
            Rearrange, squash, edit, or drop commits from{' '}
            <span className="font-mono text-lilac">{currentBranch}</span> onto{' '}
            <span className="font-mono text-teal">{targetBranch}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/35">
          <span>{todos.length} commits</span>
          {effectiveCount < todos.length && (
            <span className="text-lilac">→ {effectiveCount} after</span>
          )}
        </div>
        <button className="btn text-xs" onClick={onClose}>
          Cancel
        </button>
      </div>

      {/* legend */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-2">
        <span className="text-[10px] text-white/30">Click action to cycle:</span>
        {ACTION_CYCLE.map((a) => {
          const s = ACTION_STYLES[a];
          return (
            <span
              key={a}
              className="rounded-full border px-2 py-0.5 text-[9px] font-medium"
              style={{ color: s.color, background: s.bg, borderColor: `${s.color}33` }}
            >
              {s.label}
            </span>
          );
        })}
        <span className="ml-auto text-[10px] text-white/25">drag to reorder · Alt+↑↓ to move</span>
      </div>

      {/* todo list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {/* base target */}
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-teal" />
            <span className="flex-1 text-xs text-teal">Base: {targetBranch}</span>
          </div>

          {todos.map((todo, idx) => {
            const style = ACTION_STYLES[todo.action];
            const isDrop = todo.action === 'drop';
            const isSquash = todo.action === 'squash';
            const prevSquash = idx > 0 && todos[idx - 1].action === 'squash';

            return (
              <div
                key={todo.hash}
                draggable={todo.action !== 'drop'}
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
                onKeyDown={(e) => {
                  if (e.altKey && e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveItem(idx, -1);
                  }
                  if (e.altKey && e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveItem(idx, 1);
                  }
                }}
                className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-150 ${
                  isDrop
                    ? 'border-white/5 bg-white/1 opacity-40'
                    : `border-white/8 bg-white/3 hover:bg-white/6 ${isSquash ? 'border-lilac/20' : ''}`
                } ${isSquash && prevSquash ? 'mt-0' : ''}`}
                style={isDrop ? {} : { borderLeftColor: `${style.color}55` }}
                tabIndex={0}
              >
                {/* drag handle */}
                {!isDrop && (
                  <span
                    className="shrink-0 cursor-grab text-white/20 active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                )}

                {/* action badge */}
                <button
                  onClick={() => cycleAction(idx)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-150 hover:scale-105"
                  style={{
                    color: style.color,
                    background: style.bg,
                    borderColor: `${style.color}44`,
                  }}
                  title="Click to change action"
                >
                  {style.label}
                </button>

                {/* commit info */}
                <div className="min-w-0 flex-1">
                  {editIdx === idx ? (
                    <input
                      autoFocus
                      value={editMsg}
                      onChange={(e) => setEditMsg(e.target.value)}
                      onBlur={() => {
                        setTodos((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, message: editMsg } : t))
                        );
                        setEditIdx(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setTodos((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, message: editMsg } : t))
                          );
                          setEditIdx(null);
                        }
                        if (e.key === 'Escape') setEditIdx(null);
                      }}
                      className="w-full rounded border border-lilac/40 bg-black/30 px-2 py-1 text-xs outline-none"
                      style={{ userSelect: 'text' }}
                    />
                  ) : (
                    <div
                      className={`truncate text-[13px] ${isDrop ? 'line-through text-white/40' : 'text-white/85'}`}
                      onDoubleClick={() => {
                        if (todo.action === 'reword' || todo.action === 'edit') {
                          setEditIdx(idx);
                          setEditMsg(todo.message);
                        }
                      }}
                      title={
                        todo.action === 'reword' || todo.action === 'edit'
                          ? 'Double-click to edit message'
                          : todo.message
                      }
                    >
                      {todo.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-white/30">
                    <span className="font-mono" style={{ color: isDrop ? undefined : style.color }}>
                      {todo.shortHash}
                    </span>
                    <span>{todo.author}</span>
                  </div>
                </div>

                {/* actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70"
                    title="Move up"
                    onClick={() => moveItem(idx, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70"
                    title="Move down"
                    onClick={() => moveItem(idx, 1)}
                  >
                    ↓
                  </button>
                  {todo.action === 'drop' && (
                    <button
                      className="rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70"
                      title="Undo drop"
                      onClick={() => cycleAction(idx)}
                    >
                      ↩
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* HEAD indicator */}
          <div className="flex items-center gap-3 rounded-xl border border-lilac/30 bg-lilac/8 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-lilac shadow-[0_0_8px_rgba(196,181,253,.6)]" />
            <span className="flex-1 text-xs text-lilac">HEAD ({currentBranch})</span>
          </div>
        </div>
      </div>

      {/* footer actions */}
      <div className="flex items-center gap-3 border-t border-white/8 px-5 py-3">
        <div className="flex-1" />

        {conflict ? (
          <>
            <span className="text-xs text-amber">
              ⚠ Conflict detected — resolve in Changes, then continue
            </span>
            <button className="btn btn-danger text-xs" onClick={abortRebase}>
              Abort rebase
            </button>
            <button className="btn btn-primary text-xs" onClick={continueRebase}>
              Continue
            </button>
          </>
        ) : (
          <>
            <button className="btn text-xs" onClick={() => setConfirmAbort(true)}>
              Cancel
            </button>
            <button
              className="btn btn-primary text-xs"
              disabled={running || todos.filter((t) => t.action !== 'drop').length === 0}
              onClick={executeRebase}
            >
              {running
                ? 'Rebasing…'
                : `Start rebase${effectiveCount !== todos.length ? ` (${effectiveCount} commits)` : ''}`}
            </button>
          </>
        )}
      </div>

      {/* abort confirmation */}
      {confirmAbort && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass anim-in w-[400px] p-5">
            <div className="mb-2 text-sm font-semibold text-amber">Cancel rebase?</div>
            <div className="mb-4 text-xs text-white/50">
              All changes to the rebase plan will be lost.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn text-xs" onClick={() => setConfirmAbort(false)}>
                Keep editing
              </button>
              <button className="btn btn-danger text-xs" onClick={onClose}>
                Discard & close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
