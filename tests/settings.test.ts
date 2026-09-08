import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WALLPAPER_BLUR,
  MAX_WALLPAPER_BLUR,
  normalizeWallpaperBlur,
} from '../src/renderer/src/settings';

describe('wallpaper blur setting', () => {
  it('defaults invalid stored values and clamps valid values', () => {
    expect(normalizeWallpaperBlur(undefined)).toBe(DEFAULT_WALLPAPER_BLUR);
    expect(normalizeWallpaperBlur(Number.NaN)).toBe(DEFAULT_WALLPAPER_BLUR);
    expect(normalizeWallpaperBlur(-10)).toBe(0);
    expect(normalizeWallpaperBlur(12.6)).toBe(13);
    expect(normalizeWallpaperBlur(200)).toBe(MAX_WALLPAPER_BLUR);
  });
});
