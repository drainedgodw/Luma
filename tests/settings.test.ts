import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANEL_BLUR,
  MAX_PANEL_BLUR,
  normalizePanelBlur,
} from '../src/renderer/src/settings';

describe('panel blur setting', () => {
  it('defaults invalid stored values and clamps valid values', () => {
    expect(normalizePanelBlur(undefined)).toBe(DEFAULT_PANEL_BLUR);
    expect(normalizePanelBlur(Number.NaN)).toBe(DEFAULT_PANEL_BLUR);
    expect(normalizePanelBlur(-10)).toBe(0);
    expect(normalizePanelBlur(31.6)).toBe(32);
    expect(normalizePanelBlur(200)).toBe(MAX_PANEL_BLUR);
  });
});
