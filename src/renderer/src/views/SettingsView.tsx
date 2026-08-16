import { useSettings } from '../settings';
import { useStore } from '../store';

export default function SettingsView() {
  const { settings, update } = useSettings();
  const { repo } = useStore();

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-white/8 px-5 py-3 text-[11px] uppercase tracking-wider text-white/40">Settings</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">

          <section>
            <h2 className="mb-1 text-sm font-semibold text-white/85">Editor</h2>
            <p className="mb-3 text-xs text-white/35">Typography and behavior of the code editor.</p>
            <Row label="Font size" hint="Editor font size in pixels">
              <div className="flex items-center gap-3">
                <input type="range" min={10} max={20} value={settings.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} className="accent-lilac" />
                <span className="w-8 text-right font-mono text-xs text-white/60">{settings.fontSize}px</span>
              </div>
            </Row>
            <Row label="Tab size" hint="Spaces inserted per indentation level">
              <div className="flex gap-1">
                {[2, 4, 8].map((n) => (
                  <button key={n} className={`btn px-3 py-1 text-xs ${settings.tabSize === n ? 'border-lilac/50 bg-lilac/15 text-lilac' : ''}`} onClick={() => update({ tabSize: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </Row>
            <Toggle label="Autocomplete" hint="Ghost-text suggestions while typing; Tab accepts" value={settings.autocomplete} onChange={(v) => update({ autocomplete: v })} />
            <Toggle label="Word wrap" hint="Wrap long lines instead of horizontal scroll" value={settings.wordWrap} onChange={(v) => update({ wordWrap: v })} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-white/85">Git</h2>
            <p className="mb-3 text-xs text-white/35">How Luma surfaces the commands it runs for you.</p>
            <Toggle label="Show command equivalents" hint="Every action logs its git command to the Commands panel" value={settings.showCommandsOnAction} onChange={(v) => update({ showCommandsOnAction: v })} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-white/85">Appearance</h2>
            <p className="mb-3 text-xs text-white/35">Theme and motion.</p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              {(['cosmos', 'liquid'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                    settings.theme === t ? 'border-lilac/60 bg-lilac/10' : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <div
                    className="mb-2 h-14 rounded-lg border"
                    style={
                      t === 'cosmos'
                        ? { background: 'radial-gradient(400px 200px at 20% 0%, rgba(139,92,246,.35), transparent 60%), radial-gradient(400px 300px at 100% 100%, rgba(45,212,191,.25), transparent 60%), #07070e', borderColor: 'rgba(196,181,253,.3)' }
                        : { background: 'radial-gradient(400px 200px at 15% 0%, rgba(125,211,252,.4), transparent 60%), radial-gradient(400px 300px at 100% 100%, rgba(165,243,252,.25), transparent 55%), #0a1322', borderColor: 'rgba(186,230,253,.3)' }
                    }
                  />
                  <div className="text-[13px] text-white/85">{t === 'cosmos' ? 'Cosmos' : 'Liquid Glass'}</div>
                  <div className="text-[11px] text-white/35">{t === 'cosmos' ? 'Deep space, violet nebulae — the default' : 'Frosted aqua glass, brighter translucency'}</div>
                </button>
              ))}
            </div>
            <Toggle label="Reduce motion" hint="Disable pulsing and animated effects" value={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-white/85">About</h2>
            <div className="glass-soft flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-bold tracking-[0.25em] text-lilac">LUMA</div>
                <div className="text-xs text-white/40">Version 0.1.0 · MIT license</div>
              </div>
              <div className="text-right font-mono text-[11px] text-white/35">
                <div>{repo ? repo.split('/').pop() : 'no repository'}</div>
                <div>Electron · React · CodeMirror</div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-6 rounded-xl px-2 py-2 hover:bg-white/3">
      <div>
        <div className="text-[13px] text-white/80">{label}</div>
        <div className="text-[11px] text-white/35">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full border transition-all duration-200 ${value ? 'border-lilac/60 bg-lilac/40' : 'border-white/15 bg-white/8'}`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all duration-200 ${value ? 'left-[22px] shadow-[0_0_8px_rgba(196,181,253,.8)]' : 'left-1'}`}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </Row>
  );
}
