import { createContext, useContext, useEffect, useState } from 'react';

export interface Settings {
  fontSize: number;
  tabSize: number;
  autocomplete: boolean;
  showCommandsOnAction: boolean;
  reduceMotion: boolean;
  wordWrap: boolean;
}

const DEFAULTS: Settings = {
  fontSize: 13,
  tabSize: 2,
  autocomplete: true,
  showCommandsOnAction: true,
  reduceMotion: false,
  wordWrap: false,
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

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings]);

  return (
    <Ctx.Provider
      value={{
        settings,
        update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
