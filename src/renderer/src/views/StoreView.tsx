import { useCallback, useEffect, useState } from 'react';
import {
  stackToolDefinition,
  stackToolKey,
  type StackToolAction,
  type StackToolResult,
} from '@shared/stackCatalog';
import { LANGUAGE_PACKS, type LanguagePack } from '../languages';
import { api, requireData, type TechnologyReport } from '../lib/api';
import { useStore } from '../store';

type ActionFeedback = StackToolResult & { name: string };

export default function StoreView() {
  const { setToast } = useStore();
  const [report, setReport] = useState<TechnologyReport | null>(null),
    [toolStatus, setToolStatus] = useState<Record<string, boolean>>({}),
    [loading, setLoading] = useState(true),
    [openPack, setOpenPack] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [technology, statusResult] = await Promise.all([
        requireData(api.workspaceTechnology(), 'Could not inspect development tools'),
        api.intelInvoke('stackToolStatus'),
      ]);
      if (!statusResult.ok)
        throw new Error(statusResult.error?.message ?? 'Could not inspect project packages');
      setReport(technology);
      setToolStatus((statusResult.data as Record<string, boolean> | undefined) ?? {});
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setToast]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function runAction(action: StackToolAction, packId: string, name: string) {
    if (action === 'uninstall' &&
      !window.confirm(`Remove ${name} from this project?\n\nThe project manifest and lockfile may change.`))
      return;
    const key = stackToolKey(packId, name);
    setBusy(key);
    try {
      const result = await api.intelInvoke('stackToolAction', action, packId, name);
      if (!result.ok) throw new Error(result.error?.message ?? `${action} failed`);
      const data = result.data as StackToolResult;
      setFeedback({ ...data, name });
      setToast(data.ok
        ? `${name} ${action === 'install' ? 'installed' : 'removed'}`
        : `${name} ${action === 'install' ? 'install' : 'removal'} failed`);
      await refresh();
    } catch (error) {
      const message = (error as Error).message;
      setFeedback({ ok: false, action, name, command: '', output: message });
      setToast(message);
    } finally { setBusy(null); }
  }
  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/55">Languages &amp; Ecosystem</div>
          <div className="mt-0.5 text-[10px] text-white/25">
            click a language → install or remove approved project packages
          </div>
        </div>
        <div className="flex-1" />
        {report?.manifests.length ? (
          <span className="max-w-md truncate text-[10px] text-teal" title={report.manifests.join(', ')}>
            Detected: {report.manifests.join(', ')}
          </span>
        ) : <span className="text-[10px] text-white/25">No project manifest detected</span>}
        <button className="btn px-3 py-1 text-[11px]" disabled={loading || busy !== null} onClick={() => void refresh()}>
          {loading ? 'Checking…' : 'Refresh detection'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-3">
          {feedback && (
            <section className="glass-soft p-4">
              <div className="flex items-center gap-2 text-xs">
                <span className={feedback.ok ? 'text-teal' : 'text-red-300'}>{feedback.ok ? 'DONE' : 'FAILED'}</span>
                <span className="text-white/65">{feedback.action === 'install' ? 'Install' : 'Remove'} {feedback.name}</span>
              </div>
              {feedback.command && <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-[10px] text-lilac">{feedback.command}</pre>}
              {feedback.output && <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-[10px] text-white/55">{feedback.output}</pre>}
            </section>
          )}
          {LANGUAGE_PACKS.map((pack) => (
            <LanguageRow
              key={pack.id} pack={pack} report={report} toolStatus={toolStatus} loading={loading}
              open={openPack === pack.id}
              toggle={() => setOpenPack((current) => current === pack.id ? null : pack.id)}
              busy={busy} runAction={runAction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageRow({ pack, report, toolStatus, loading, open, toggle, busy, runAction }: {
  pack: LanguagePack;
  report: TechnologyReport | null;
  toolStatus: Record<string, boolean>;
  loading: boolean;
  open: boolean;
  toggle: () => void;
  busy: string | null;
  runAction: (action: StackToolAction, packId: string, name: string) => Promise<void>;
}) {
  const runtime = report?.runtimes.find((item) => item.id === pack.runtimeId);
  const detected = report?.ecosystems[pack.id] ?? [];
  const hasAutomaticActions = [...pack.frameworks, ...pack.libraries].some((name) =>
    Boolean(stackToolDefinition(pack.id, name))
  );
  return (
    <article className={`glass-soft overflow-hidden transition-colors ${open ? 'border-white/20' : ''}`}>
      <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-white/3" onClick={toggle}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold"
          style={{ background: `${pack.color}22`, border: `1px solid ${pack.color}55`, color: pack.color, boxShadow: `0 0 14px ${pack.color}22` }}>
          {pack.name.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white/85">{pack.name}</div>
          <div className="text-[10px] text-white/35">
            {pack.exts.join(' · ')}
            {detected.length > 0 && <span className="text-teal"> · in project: {detected.slice(0, 5).join(', ')}</span>}
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] ${runtime?.available ? 'border-teal/25 bg-teal/8 text-teal' : 'border-amber/20 bg-amber/5 text-amber'}`}>
          {runtime?.available ? runtime.version : 'runtime missing'}
        </span>
        <span className={`text-white/35 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="border-t border-white/8 p-4">
          <div className="mb-3 text-[10px] leading-relaxed text-white/40">
            {pack.blurb} Actions below use an allowlisted package and the project package manager. Python packages use a project-local .venv.
          </div>
          <InstallGroup label="Frameworks" names={pack.frameworks} packId={pack.id} toolStatus={toolStatus} loading={loading} busy={busy} runAction={runAction} />
          <InstallGroup label="Libraries" names={pack.libraries} packId={pack.id} toolStatus={toolStatus} loading={loading} busy={busy} runAction={runAction} />
          {!hasAutomaticActions && <div className="mt-2 text-[10px] text-white/30">{pack.name} does not have a safe, universal project package command yet.</div>}
        </div>
      )}
    </article>
  );
}

function InstallGroup({ label, names, packId, toolStatus, loading, busy, runAction }: {
  label: string;
  names: string[];
  packId: string;
  toolStatus: Record<string, boolean>;
  loading: boolean;
  busy: string | null;
  runAction: (action: StackToolAction, packId: string, name: string) => Promise<void>;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[9px] uppercase tracking-wider text-white/25">{label}</div>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => {
          const key = stackToolKey(packId, name),
            definition = stackToolDefinition(packId, name),
            active = toolStatus[key] ?? false,
            action: StackToolAction = active ? 'uninstall' : 'install';
          return (
            <span key={name} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] ${active ? 'border-teal/35 bg-teal/10 text-teal' : 'border-white/10 bg-white/3 text-white/70'}`}>
              {active && '✓ '}{name}
              {definition ? (
                <button
                  className={`rounded border px-1.5 py-0.5 text-[9px] disabled:opacity-40 ${active ? 'border-red-300/35 text-red-200 hover:bg-red-300/10' : 'border-lilac/40 text-lilac hover:bg-lilac/15'}`}
                  disabled={loading || busy !== null}
                  title={`${active ? 'Remove' : 'Install'} ${name} ${active ? 'from' : 'into'} this project`}
                  onClick={() => void runAction(action, packId, name)}
                >
                  {busy === key ? (active ? 'removing…' : 'installing…') : active ? 'remove' : 'install'}
                </button>
              ) : <span className="text-[9px] text-white/25" title="No safe automatic project command is available">manual</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
