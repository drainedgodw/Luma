import { describe, expect, it } from 'vitest';
import {
  editorSessionKey,
  readEditorSession,
  writeEditorSession,
  type SessionStorage,
} from '../src/renderer/src/editor/session';

class MemoryStorage implements SessionStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('editor workspace sessions', () => {
  it('restores open tabs and the active tab per workspace', () => {
    const storage = new MemoryStorage();
    expect(writeEditorSession('/projects/luma', {
      tabs: ['src/main.ts', 'README.md'],
      active: 'src/main.ts',
    }, storage)).toBe(true);

    expect(readEditorSession('/projects/luma', storage)).toEqual({
      version: 1,
      tabs: ['src/main.ts', 'README.md'],
      active: 'src/main.ts',
    });
    expect(readEditorSession('/projects/another', storage).tabs).toEqual([]);
  });

  it('deduplicates paths and falls back when the active tab is invalid', () => {
    const storage = new MemoryStorage();
    storage.setItem(editorSessionKey('/work'), JSON.stringify({
      tabs: ['a.ts', 'a.ts', '', 7, 'b.ts'],
      active: 'deleted.ts',
    }));

    expect(readEditorSession('/work', storage)).toEqual({
      version: 1,
      tabs: ['a.ts', 'b.ts'],
      active: 'b.ts',
    });
  });

  it('ignores corrupt saved data', () => {
    const storage = new MemoryStorage();
    storage.setItem(editorSessionKey('/broken'), '{');
    expect(readEditorSession('/broken', storage)).toEqual({
      version: 1,
      tabs: [],
      active: null,
    });
  });
});
