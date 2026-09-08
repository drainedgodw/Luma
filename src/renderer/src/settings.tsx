import { createContext, useContext, useEffect, useState } from 'react';
import { playUISound, soundForButton } from './uiSounds';

export const DEFAULT_WALLPAPER_BLUR = 18;
export const MAX_WALLPAPER_BLUR = 40;

export function normalizeWallpaperBlur(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WALLPAPER_BLUR;
  return Math.min(MAX_WALLPAPER_BLUR, Math.max(0, Math.round(value)));
}

export interface Settings {
  fontSize: number;
  tabSize: number;
  autocomplete: boolean;
  showCommandsOnAction: boolean;
  reduceMotion: boolean;
  wordWrap: boolean;
  theme: 'cosmos' | 'liquid';
  wallpaperBlur: number;
  installedPacks: string[];
  explorer: 'pinned' | 'auto';
  soundEffects: boolean;
  soundVolume: number;
}

const DEFAULTS: Settings = {
  fontSize: 13,
  tabSize: 2,
  autocomplete: true,
  showCommandsOnAction: true,
  reduceMotion: false,
  wordWrap: false,
  theme: 'cosmos',
  wallpaperBlur: DEFAULT_WALLPAPER_BLUR,
  installedPacks: ['typescript', 'javascript'],
  explorer: 'auto',
  soundEffects: true,
  soundVolume: 0.45,
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
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
      return {
        ...DEFAULTS,
        ...stored,
        wallpaperBlur: normalizeWallpaperBlur(stored.wallpaperBlur),
      };
    } catch {
      return DEFAULTS;
    }
  });

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--wallpaper-blur', `${settings.wallpaperBlur}px`);
  }, [settings]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!settings.soundEffects || settings.soundVolume <= 0 || !(event.target instanceof Element))
        return;
      const button = event.target.closest('button');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      const sound = soundForButton(button);
      if (sound) playUISound(sound, settings.soundVolume);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [settings.soundEffects, settings.soundVolume]);

  // allow the host to force a theme (used by visual test harness)
  useEffect(() => {
    const on = (e: Event) => update({ theme: (e as CustomEvent<'cosmos' | 'liquid'>).detail });
    window.addEventListener('luma:theme', on);
    return () => window.removeEventListener('luma:theme', on);
  });

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}
