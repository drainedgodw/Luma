import { LANGUAGE_PACKS, UPCOMING_PACKS, type LanguagePack } from '../languages';

export default function StoreView() {
  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Languages</span>
        <span className="text-[11px] text-white/25">language packs the editor understands</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3">
          {LANGUAGE_PACKS.map((p) => <PackCard key={p.id} pack={p} />)}
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-white/35">Coming with the next editor core</div>
          <div className="grid grid-cols-3 gap-3">
            {UPCOMING_PACKS.map((p) => (
              <div key={p.id} className="glass-soft flex items-center gap-3 px-4 py-3 opacity-60">
                <LangDot pack={p} />
                <div>
                  <div className="text-xs text-white/70">{p.name}</div>
                  <div className="text-[10px] text-white/35">soon</div>
                </div>
              </div>
            ))}
          </div>
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

function PackCard({ pack }: { pack: LanguagePack }) {
  return (
    <div className="glass-soft group flex flex-col gap-2 p-4 transition-all duration-200 hover:border-white/15">
      <div className="flex items-center gap-3">
        <LangDot pack={pack} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white/85">{pack.name}</div>
          <div className="text-[11px] text-white/35">v{pack.version} · {pack.kind}</div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-white/40">{pack.blurb}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {pack.exts.slice(0, 4).map((e) => (
            <span key={e} className="rounded border border-white/10 bg-white/4 px-1.5 py-0.5 font-mono text-[10px] text-white/40">{e}</span>
          ))}
        </div>
        <span className="rounded-full border border-teal/40 bg-teal/10 px-2.5 py-0.5 text-[10px] text-teal">✓ built-in</span>
      </div>
    </div>
  );
}
