import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { css as cssMode } from '@codemirror/legacy-modes/mode/css';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { go } from '@codemirror/legacy-modes/mode/go';
import { c, cpp, csharp, java } from '@codemirror/legacy-modes/mode/clike';

/**
 * Language packs. Installable packs toggle real editor support:
 * uninstalled → the file opens as plain text, no highlight, no completion.
 * Markup/data formats (HTML, CSS, JSON, Markdown) ship with the editor core
 * and are not listed in the store.
 */
export interface LanguagePack {
  id: string;
  name: string;
  version: string;
  exts: string[];
  color: string;
  blurb: string;
  keywords: string[];
}

export const LANGUAGE_PACKS: LanguagePack[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    version: '5.x',
    exts: ['.ts', '.mts', '.cts', '.tsx'],
    color: '#3178c6',
    blurb: 'Statically typed superset of JavaScript that compiles to plain JS. Types catch bugs before runtime; the ecosystem of every modern tool.',
    keywords: ['const', 'let', 'var', 'function', 'return', 'interface', 'type', 'enum', 'class', 'extends', 'implements', 'import', 'export', 'from', 'as', 'async', 'await', 'new', 'this', 'super', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'namespace', 'declare', 'satisfies', 'keyof', 'typeof', 'instanceof', 'in', 'of', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'yield', 'void', 'never', 'unknown', 'any', 'string', 'number', 'boolean', 'null', 'undefined', 'true', 'false'],
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    version: 'ES2024',
    exts: ['.js', '.jsx', '.mjs', '.cjs'],
    color: '#f7df1e',
    blurb: 'The language of the web: dynamic, prototype-based, runs natively in every browser and on servers via Node.',
    keywords: ['const', 'let', 'var', 'function', 'return', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'new', 'this', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'of', 'in', 'delete', 'yield', 'true', 'false', 'null', 'undefined'],
  },
  {
    id: 'python',
    name: 'Python',
    version: '3.12',
    exts: ['.py'],
    color: '#3776ab',
    blurb: 'General-purpose language loved for data science, scripting, automation and backend work. Readable syntax, huge library ecosystem.',
    keywords: ['def', 'class', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'pass', 'break', 'continue', 'global', 'nonlocal', 'async', 'await', 'self', 'print', 'range', 'len', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple'],
  },
  {
    id: 'rust',
    name: 'Rust',
    version: '2024',
    exts: ['.rs'],
    color: '#dea584',
    blurb: 'Systems language focused on memory safety without garbage collection. Powers fast command-line tools, WebAssembly and OS components.',
    keywords: ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'match', 'if', 'else', 'loop', 'while', 'for', 'in', 'return', 'break', 'continue', 'async', 'await', 'move', 'ref', 'dyn', 'where', 'unsafe', 'type', 'as', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'Vec', 'String'],
  },
  {
    id: 'go',
    name: 'Go',
    version: '1.23',
    exts: ['.go'],
    color: '#00add8',
    blurb: 'Compiled language from Google built for simple concurrency and fast builds. Standard for cloud services, CLIs and network tooling.',
    keywords: ['func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'switch', 'case', 'default', 'if', 'else', 'for', 'range', 'return', 'break', 'continue', 'fallthrough', 'goto', 'true', 'false', 'nil', 'string', 'int', 'error', 'make', 'new', 'append', 'len', 'cap', 'panic', 'recover'],
  },
  {
    id: 'cpp',
    name: 'C / C++',
    version: 'C++23',
    exts: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp'],
    color: '#f34b7d',
    blurb: 'The classic systems languages: maximal control over memory and performance. Foundations of game engines, browsers and embedded.',
    keywords: ['int', 'char', 'bool', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'const', 'static', 'class', 'struct', 'enum', 'union', 'template', 'typename', 'namespace', 'using', 'public', 'private', 'protected', 'virtual', 'override', 'inline', 'new', 'delete', 'this', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'throw', 'auto', 'nullptr', 'true', 'false', 'std', 'vector', 'string', 'cout', 'cin'],
  },
  {
    id: 'java',
    name: 'Java',
    version: '21',
    exts: ['.java'],
    color: '#e76f00',
    blurb: 'Mature object-oriented platform: write once, run anywhere. Backbone of enterprise backends and Android.',
    keywords: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'int', 'long', 'double', 'boolean', 'String', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'this', 'super', 'abstract', 'synchronized', 'volatile', 'enum', 'record', 'var', 'null', 'true', 'false'],
  },
  {
    id: 'csharp',
    name: 'C#',
    version: '12',
    exts: ['.cs'],
    color: '#68217a',
    blurb: 'Modern object-oriented language of the .NET platform: games via Unity, cross-platform apps and services.',
    keywords: ['using', 'namespace', 'class', 'struct', 'interface', 'enum', 'record', 'public', 'private', 'protected', 'internal', 'static', 'readonly', 'const', 'void', 'int', 'string', 'bool', 'var', 'new', 'return', 'if', 'else', 'for', 'foreach', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'override', 'virtual', 'abstract', 'sealed', 'get', 'set', 'null', 'true', 'false'],
  },
];

/** Packs installed out of the box. */
export const DEFAULT_INSTALLED = ['typescript', 'javascript'];

export function keywordsFor(path: string, installed: string[] = DEFAULT_INSTALLED): string[] {
  const lower = path.toLowerCase();
  const pack = LANGUAGE_PACKS.find((p) => installed.includes(p.id) && p.exts.some((e) => lower.endsWith(e)));
  return pack ? pack.keywords : [];
}

/** CodeMirror language support for a file, honoring pack install state. */
export function langSupport(path: string, installed: string[]): import('@codemirror/state').Extension[] {
  const lower = path.toLowerCase();
  const has = (id: string) => installed.includes(id);
  if (/\.(tsx|jsx)$/.test(lower)) return has('typescript') ? [javascript({ typescript: true, jsx: true })] : [];
  if (/\.(ts|mts|cts)$/.test(lower)) return has('typescript') ? [javascript({ typescript: true })] : [];
  if (/\.(js|jsx|mjs|cjs)$/.test(lower)) return has('javascript') ? [javascript({ jsx: true })] : [];
  if (lower.endsWith('.py')) return has('python') ? [python()] : [];
  if (lower.endsWith('.rs')) return has('rust') ? [StreamLanguage.define(rust)] : [];
  if (lower.endsWith('.go')) return has('go') ? [StreamLanguage.define(go)] : [];
  if (lower.endsWith('.java')) return has('java') ? [StreamLanguage.define(java)] : [];
  if (/\.(cs)$/.test(lower)) return has('csharp') ? [StreamLanguage.define(csharp)] : [];
  if (/\.(cpp|cc|cxx|hpp)$/.test(lower)) return has('cpp') ? [StreamLanguage.define(cpp)] : [];
  if (/\.(c|h)$/.test(lower)) return has('cpp') ? [StreamLanguage.define(c)] : [];
  // core formats — always available
  if (lower.endsWith('.json')) return [json()];
  if (/\.(md|markdown)$/.test(lower)) return [markdown()];
  if (lower.endsWith('.css')) return [StreamLanguage.define(cssMode)];
  if (/\.(html|htm|svg|xml)$/.test(lower)) return [StreamLanguage.define(xml)];
  return [];
}

/** Short badge for a file name, VS Code style. */
export function fileBadge(path: string): { label: string; color: string } {
  const lower = path.toLowerCase();
  const m = /\.([a-z0-9]+)$/.exec(lower);
  const ext = m ? m[1] : '';
  const table: Record<string, { label: string; color: string }> = {
    ts: { label: 'TS', color: '#3178c6' },
    tsx: { label: 'TSX', color: '#3178c6' },
    mts: { label: 'TS', color: '#3178c6' },
    js: { label: 'JS', color: '#f7df1e' },
    jsx: { label: 'JSX', color: '#f7df1e' },
    mjs: { label: 'JS', color: '#f7df1e' },
    json: { label: '{ }', color: '#a3be8c' },
    md: { label: 'MD', color: '#94a3b8' },
    css: { label: 'CSS', color: '#38bdf8' },
    html: { label: '<>', color: '#e34f26' },
    py: { label: 'PY', color: '#3776ab' },
    rs: { label: 'RS', color: '#dea584' },
    go: { label: 'GO', color: '#00add8' },
    java: { label: 'JV', color: '#e76f00' },
    cs: { label: 'C#', color: '#68217a' },
    c: { label: 'C', color: '#f34b7d' },
    cpp: { label: 'C++', color: '#f34b7d' },
    h: { label: 'H', color: '#f34b7d' },
    yml: { label: 'YML', color: '#cbccc6' },
    yaml: { label: 'YML', color: '#cbccc6' },
    lock: { label: 'LCK', color: '#cbccc6' },
    sh: { label: 'SH', color: '#89e051' },
    png: { label: 'IMG', color: '#a074c4' },
    jpg: { label: 'IMG', color: '#a074c4' },
    svg: { label: 'SVG', color: '#ffb13b' },
  };
  return table[ext] ?? { label: '·', color: '#6b7280' };
}
