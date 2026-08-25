import { useCallback, useEffect, useState } from 'react';
import { LANGUAGE_PACKS, type LanguagePack } from '../languages';
import { api, requireData, type TechnologyReport } from '../lib/api';
import { useStore } from '../store';

const INSTALLABLE: Record<string, string[]> = {
  typescript: ['React', 'Next.js', 'Angular', 'NestJS', 'Zod', 'Vitest', 'Prisma', 'tRPC'],
  javascript: ['React', 'Vue', 'Svelte', 'Express', 'Vite', 'Jest', 'Axios', 'Three.js'],
  python: ['Django', 'FastAPI', 'Flask', 'NumPy', 'pandas', 'PyTorch', 'pytest'],
  rust: ['Axum', 'Actix Web', 'Rocket', 'Bevy', 'Tokio', 'Serde', 'Clap', 'Rayon'],
  go: ['Gin', 'Fiber', 'Echo', 'Cobra', 'GORM', 'Testify', 'Zap'],
};

export default function StoreView() {
  const { setToast } = useStore();
  const [report, setReport] = useState<TechnologyReport | null>(null),
    [loading, setLoading] = useState(true),
    [openPack, setOpenPack] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [installing, setInstalling] = useState<Record<string, 'ok' | 'fail'>>({});
  const refresh = useCallback(() => {
    setLoading(true);
    void requireData(api.workspaceTechnology(), 'Could not inspect development tools')
      .then(setReport)
      .catch((error) => setToast((error as Error).message))
      .finally(() => setLoading(false));
  }, [setToast]);
  useEffect(refresh, [refresh]);
  async function install(packId: string, name: string) {
    const key = `${packId}:${name}`;
    setBusy(key);
    try {
      const result = await api.intelInvoke('installTool', packId, name);
      if (!result.ok) throw new Error(result.error?.message ?? 'Install failed');
      const data = result.data as { ok: boolean; output: string };
      setInstalling((current) => ({ ...current, [key]: data.ok ? 'ok' : 'fail' }));
      setToast(data.ok ? `${name} installed` : `${name} install failed — see output in Tools`);
      refresh();
    } catch (error) {
      setInstalling((current) => ({ ...current, [key]: 'fail' }));
      setToast((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/55">
            Languages &amp; Ecosystem
          </div>
          <div className="mt-0.5 text-[10px] text-white/25">
            click a language → frameworks &amp; libraries → install into this project
          </div>
        </div>
        <div className="flex-1" />
        {report?.manifests.length ? (
          <span
            className="max-w-md truncate text-[10px] text-teal"
            title={report.manifests.join(', ')}
          >
            Detected: {report.manifests.join(', ')}
          </span>
        ) : (
          <span className="text-[10px] text-white/25">No project manifest detected</span>
        )}
        <button className="btn px-3 py-1 text-[11px]" disabled={loading} onClick={refresh}>
          {loading ? 'Checking…' : 'Refresh detection'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-3">
          {LANGUAGE_PACKS.map((pack) => (
            <LanguageRow
              key={pack.id}
              pack={pack}
              report={report}
              open={openPack === pack.id}
              toggle={() => setOpenPack((current) => (current === pack.id ? null : pack.id))}
              busy={busy}
              installing={installing}
              install={install}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageRow({
  pack,
  report,
  open,
  toggle,
  busy,
  installing,
  install,
}: {
  pack: LanguagePack;
  report: TechnologyReport | null;
  open: boolean;
  toggle: () => void;
  busy: string | null;
  installing: Record<string, 'ok' | 'fail'>;
  install: (packId: string, name: string) => Promise<void>;
}) {
  const runtime = report?.runtimes.find((item) => item.id === pack.runtimeId);
  const detected = report?.ecosystems[pack.id] ?? [];
  const detectedLower = new Set(detected.map((item) => item.toLocaleLowerCase()));
  const installable = INSTALLABLE[pack.id] ?? [];
  return (
    <article
      className={`glass-soft overflow-hidden transition-colors ${open ? 'border-white/20' : ''}`}
    >
      <button
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-white/3"
        onClick={toggle}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold"
          style={{
            background: `${pack.color}22`,
            border: `1px solid ${pack.color}55`,
            color: pack.color,
            boxShadow: `0 0 14px ${pack.color}22`,
          }}
        >
          {pack.name.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white/85">{pack.name}</div>
          <div className="text-[10px] text-white/35">
            {pack.exts.join(' · ')}
            {detected.length > 0 && (
              <span className="text-teal"> · in project: {detected.slice(0, 5).join(', ')}</span>
            )}
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[9px] ${runtime?.available ? 'border-teal/25 bg-teal/8 text-teal' : 'border-amber/20 bg-amber/5 text-amber'}`}
        >
          {runtime?.available ? runtime.version : 'runtime missing'}
        </span>
        <span className={`text-white/35 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="border-t border-white/8 p-4">
          <div className="mb-3 text-[10px] leading-relaxed text-white/40">
            {pack.blurb} Editor support is built in — buttons below install real packages into this
            project with its package manager.
          </div>
          <InstallGroup
            label="Frameworks"
            names={pack.frameworks}
            installable={installable}
            detected={detectedLower}
            packId={pack.id}
            busy={busy}
            installing={installing}
            install={install}
          />
          <InstallGroup
            label="Libraries"
            names={pack.libraries}
            installable={installable}
            detected={detectedLower}
            packId={pack.id}
            busy={busy}
            installing={installing}
            install={install}
          />
          {installable.length === 0 && (
            <div className="mt-2 text-[10px] text-white/30">
              {pack.name} has no central package manager — install its frameworks manually.
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function InstallGroup({
  label,
  names,
  installable,
  detected,
  packId,
  busy,
  installing,
  install,
}: {
  label: string;
  names: string[];
  installable: string[];
  detected: Set<string>;
  packId: string;
  busy: string | null;
  installing: Record<string, 'ok' | 'fail'>;
  install: (packId: string, name: string) => Promise<void>;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[9px] uppercase tracking-wider text-white/25">{label}</div>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => {
          const key = `${packId}:${name}`,
            lower = name.toLocaleLowerCase(),
            active = [...detected].some(
              (item) => item === lower || item.includes(lower) || lower.includes(item)
            ),
            canInstall = installable.includes(name),
            state = installing[key];
          return (
            <span
              key={name}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] ${active ? 'border-teal/35 bg-teal/10 text-teal' : 'border-white/10 bg-white/3 text-white/70'}`}
            >
              {active && '✓ '}
              {name}
              {canInstall ? (
                <button
                  className="rounded border border-lilac/40 px-1.5 py-0.5 text-[9px] text-lilac hover:bg-lilac/15 disabled:opacity-40"
                  disabled={busy !== null}
                  title={`Install ${name} into this project`}
                  onClick={() => void install(packId, name)}
                >
                  {busy === key
                    ? 'installing…'
                    : state === 'ok'
                      ? 'installed'
                      : state === 'fail'
                        ? 'retry'
                        : 'install'}
                </button>
              ) : (
                <span
                  className="text-[9px] text-white/25"
                  title="No automatic installer for this language"
                >
                  manual
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
