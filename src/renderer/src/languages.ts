export interface LanguagePack {
  id: string;
  name: string;
  version: string;
  /** extensions the editor understands once the pack is installed */
  exts: string[];
  color: string;
  blurb: string;
  /** already shipped with the app */
  builtin: boolean;
  /** completion keywords contributed to the editor */
  keywords: string[];
  kind: 'language' | 'framework' | 'markup' | 'data';
}

export const LANGUAGE_PACKS: LanguagePack[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    version: '5.8',
    exts: ['.ts', '.mts', '.cts'],
    color: '#3178c6',
    blurb: 'The language Luma itself is written in. Strict types, first-class tooling.',
    builtin: true,
    kind: 'language',
    keywords: ['const', 'let', 'var', 'function', 'return', 'interface', 'type', 'enum', 'class', 'extends', 'implements', 'import', 'export', 'from', 'as', 'async', 'await', 'new', 'this', 'super', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'namespace', 'declare', 'satisfies', 'keyof', 'typeof', 'instanceof', 'in', 'of', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'yield', 'void', 'never', 'unknown', 'any', 'string', 'number', 'boolean', 'null', 'undefined', 'true', 'false', 'default'],
  },
  {
    id: 'tsx',
    name: 'TypeScript React (TSX)',
    version: 'react 19',
    exts: ['.tsx'],
    color: '#61dafb',
    blurb: 'JSX components — every panel of the Luma interface is a TSX module.',
    builtin: true,
    kind: 'framework',
    keywords: ['interface', 'type', 'const', 'function', 'return', 'export', 'import', 'default', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext', 'props', 'fragment', 'key', 'ref', 'children', 'render'],
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    version: 'ES2024',
    exts: ['.js', '.jsx', '.mjs', '.cjs'],
    color: '#f7df1e',
    blurb: 'The runtime glue of the Electron world.',
    builtin: true,
    kind: 'language',
    keywords: ['const', 'let', 'var', 'function', 'return', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'new', 'this', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'of', 'in', 'delete', 'yield', 'true', 'false', 'null', 'undefined'],
  },
  {
    id: 'css',
    name: 'CSS / Tailwind',
    version: 'tailwind 4',
    exts: ['.css'],
    color: '#38bdf8',
    blurb: 'The glass: Luma visuals are authored in Tailwind 4 + hand-tuned CSS.',
    builtin: true,
    kind: 'markup',
    keywords: ['display', 'position', 'flex', 'grid', 'background', 'color', 'border', 'radius', 'margin', 'padding', 'transition', 'transform', 'animation', 'backdrop-filter', 'opacity', 'hover', 'focus', 'active', 'before', 'after', 'root', 'var', 'important'],
  },
  {
    id: 'html',
    name: 'HTML',
    version: 'living standard',
    exts: ['.html', '.htm'],
    color: '#e34f26',
    blurb: 'The shell document every Luma window starts from.',
    builtin: true,
    kind: 'markup',
    keywords: ['doctype', 'html', 'head', 'body', 'div', 'span', 'meta', 'script', 'link', 'title', 'style'],
  },
  {
    id: 'json',
    name: 'JSON',
    version: 'RFC 8259',
    exts: ['.json'],
    color: '#a3be8c',
    blurb: 'Manifests, config, lockfiles — everywhere in a Node project.',
    builtin: true,
    kind: 'data',
    keywords: ['true', 'false', 'null'],
  },
  {
    id: 'markdown',
    name: 'Markdown',
    version: 'commonmark',
    exts: ['.md', '.markdown'],
    color: '#94a3b8',
    blurb: 'Docs and READMEs, rendered structure-aware.',
    builtin: true,
    kind: 'markup',
    keywords: [],
  },
  {
    id: 'python',
    name: 'Python',
    version: '3.12',
    exts: ['.py'],
    color: '#3776ab',
    blurb: 'General-purpose scripting — bundled for polyglot repos.',
    builtin: true,
    kind: 'language',
    keywords: ['def', 'class', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'pass', 'break', 'continue', 'global', 'nonlocal', 'async', 'await', 'self', 'print', 'range', 'len', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple'],
  },
  {
    id: 'shell',
    name: 'Shell (bash)',
    version: 'POSIX',
    exts: ['.sh', '.bash'],
    color: '#89e051',
    blurb: 'CI scripts and packaging glue.',
    builtin: true,
    kind: 'language',
    keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'local', 'export', 'echo', 'set', 'cd', 'exit'],
  },
];

/** Extra packs listed in the store as "coming with the next editor core". */
export const UPCOMING_PACKS: LanguagePack[] = [
  { id: 'rust', name: 'Rust', version: '2024', exts: ['.rs'], color: '#dea584', blurb: 'Systems language — planned via Tree-sitter grammar.', builtin: false, kind: 'language', keywords: [] },
  { id: 'go', name: 'Go', version: '1.23', exts: ['.go'], color: '#00add8', blurb: 'Planned via Tree-sitter grammar.', builtin: false, kind: 'language', keywords: [] },
  { id: 'cpp', name: 'C/C++', version: 'c++23', exts: ['.c', '.cpp', '.h'], color: '#f34b7d', blurb: 'Planned via Tree-sitter grammar.', builtin: false, kind: 'language', keywords: [] },
];

/** Completion keywords for a file path, merged from matching packs. */
export function keywordsFor(path: string): string[] {
  const lower = path.toLowerCase();
  const packs = LANGUAGE_PACKS.filter((p) => p.exts.some((e) => lower.endsWith(e)));
  return packs.flatMap((p) => p.keywords);
}
