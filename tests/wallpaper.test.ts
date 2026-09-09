import { describe, expect, it } from 'vitest';
import { getWallpaper } from '../src/main/wallpaper';

describe('Liquid Glass desktop background', () => {
  it('never copies the desktop wallpaper into the renderer', async () => {
    await expect(getWallpaper()).resolves.toBeNull();
  });
});
