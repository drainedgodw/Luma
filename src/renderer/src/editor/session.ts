export interface EditorSession {
  version: 1;
  tabs: string[];
  active: string | null;
}

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SESSION_PREFIX = 'luma.editor.session.v1:';
const MAX_REMEMBERED_TABS = 40;

export function editorSessionKey(workspacePath: string): string {
  return `${SESSION_PREFIX}${encodeURIComponent(workspacePath)}`;
}

function availableStorage(storage?: SessionStorage): SessionStorage | null {
  if (storage) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function normalizeSession(value: unknown): EditorSession {
  const source =
    typeof value === 'object' && value !== null
      ? (value as { tabs?: unknown; active?: unknown })
      : {};
  const candidates = Array.isArray(source.tabs) ? source.tabs : [];
  const tabs = [
    ...new Set(
      candidates
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_REMEMBERED_TABS);
  const requestedActive = typeof source.active === 'string' ? source.active : null;
  const active =
    requestedActive && tabs.includes(requestedActive) ? requestedActive : (tabs.at(-1) ?? null);
  return { version: 1, tabs, active };
}

export function readEditorSession(workspacePath: string, storage?: SessionStorage): EditorSession {
  const target = availableStorage(storage);
  if (!workspacePath || !target) return { version: 1, tabs: [], active: null };
  try {
    const saved = target.getItem(editorSessionKey(workspacePath));
    return saved
      ? normalizeSession(JSON.parse(saved) as unknown)
      : { version: 1, tabs: [], active: null };
  } catch {
    return { version: 1, tabs: [], active: null };
  }
}

export function writeEditorSession(
  workspacePath: string,
  session: Pick<EditorSession, 'tabs' | 'active'>,
  storage?: SessionStorage
): boolean {
  const target = availableStorage(storage);
  if (!workspacePath || !target) return false;
  try {
    target.setItem(editorSessionKey(workspacePath), JSON.stringify(normalizeSession(session)));
    return true;
  } catch {
    return false;
  }
}
