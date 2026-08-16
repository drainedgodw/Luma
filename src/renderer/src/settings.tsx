import { createContext, useContext, useEffect, useState } from 'react';

export interface Settings {
  fontSize: number;
  tabSize: number;
  autocomplete: boolean;
  showCommandsOnAction: boolean;
  reduceMotion: boolean;
  wordWrap: boolean;
  theme: 'cosmos' | 'liquid';
  installedPacks: string[];
  explorer: 'pinned' | 'auto';
}

const DEFAULTS: Settings = {
  fontSize: 13,
  tabSize: 2,
  autocomplete: true,
  showCommandsOnAction: true,
  reduceMotion: false,
  wordWrap: false,
  theme: 'cosmos',
  installedPacks: ['typescript', 'javascript'],
  explorer: 'auto',
};

const KEY = 'luma.settings';

const Ctx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void }>({
  settings: DEFAULTS,
  update: () => {},
});
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return DEFAULTS;
    }
  });

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  // allow the host to force a theme (used by visual test harness)
  useEffect(() => {
    const on = (e: Event) => update({ theme: (e as CustomEvent<'cosmos' | 'liquid'>).detail });
    window.addEventListener('luma:theme', on);
    return () => window.removeEventListener('luma:theme', on);
  });

  return (
    <Ctx.Provider value={{ settings, update }}>
      {children}
    </Ctx.Provider>
  );
}
