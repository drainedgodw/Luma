import { useState } from 'react';
import { LANGUAGE_PACKS, type LanguagePack } from '../languages';
import { useSettings } from '../settings';

export default function StoreView() {
  const { settings, update } = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const installed = settings.installedPacks;

  function toggle(pack: LanguagePack) {
    // the short pause is the "download": the editor wires real grammar + completion
    setBusy(pack.id);
    setTimeout(() => {
      update({
        installedPacks: installed.includes(pack.id) ? installed.filter((i) => i !== pack.id) : [...installed, pack.id],
      });
      setBusy(null);
    }, 450);
  }

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Languages</span>
        <span className="text-[11px] text-white/25">install packs to teach the editor new languages</span>
        <div className="flex-1" />
        <span className="text-[11px] text-white/35">{installed.length} of {LANGUAGE_PACKS.length} installed</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3">
          {LANGUAGE_PACKS.map((pack) => {
            const isInstalled = installed.includes(pack.id);
            return (
              <div key={pack.id} className="glass-soft flex flex-col gap-2 p-4 transition-all duration-200 hover:border-white/15">
                <div className="flex items-center gap-3">
                  <LangDot pack={pack} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/85">{pack.name}</div>
                    <div className="text-[11px] text-white/35">v{pack.version} · {pack.exts.slice(0, 3).join(' ')}</div>
                  </div>
                </div>
                <p className="min-h-[3em] text-[11px] leading-relaxed text-white/40">{pack.blurb}</p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex gap-1">
                    {pack.exts.slice(0, 4).map((e) => (
                      <span key={e} className="rounded border border-white/10 bg-white/4 px-1.5 py-0.5 font-mono text-[10px] text-white/40">{e}</span>
                    ))}
                  </div>
                  {isInstalled ? (
                    <button
                      className="btn px-3 py-1 text-[11px] hover:border-rose/40 hover:text-rose"
                      title={`Uninstall ${pack.name} — its files open as plain text`}
                      disabled={busy === pack.id}
                      onClick={() => toggle(pack)}
                    >
                      {busy === pack.id ? 'Removing…' : 'Uninstall'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary px-3 py-1 text-[11px]"
                      disabled={busy === pack.id}
                      onClick={() => toggle(pack)}
                    >
                      {busy === pack.id ? 'Downloading…' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-6 max-w-3xl text-center text-[11px] leading-relaxed text-white/25">
          Installing a pack enables syntax highlighting and Tab completion for its files.<br />
          Uninstalling is reversible — install it back any time.
        </div>
      </div>
    </div>
  );
}

function LangDot({ pack }: { pack: LanguagePack }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold"
      style={{ background: `${pack.color}22`, border: `1px solid ${pack.color}55`, color: pack.color, boxShadow: `0 0 14px ${pack.color}33` }}>
      {pack.name.slice(0, 2)}
    </span>
  );
}
