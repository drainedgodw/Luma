import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import EditorPane from './EditorPane';

interface Node {
  name: string;
  dir: boolean;
  path: string;
  open?: boolean;
}

export default function FileTree() {
  const { repo } = useStore();
  const [tree, setTree] = useState<Node[]>([]);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {
    api.fs.list('').then((r) => setTree((r.data ?? []).map(toNode(''))));
  }, [repo]);

  const toNode = (parent: string) => (e: { name: string; dir: boolean }): Node => ({
    ...e,
    path: parent ? `${parent}/${e.name}` : e.name,
  });

  const toggle = useCallback(async (n: Node) => {
    if (!n.dir) {
      setFile(n.path);
      return;
    }
    if (n.open) {
      setTree((prev) => prev.map((x) => (x.path === n.path ? { ...x, open: false } : x)).filter((x) => !x.path.startsWith(n.path + '/')));
      // keep the dir row: filter removed it — re-add by mapping first
      return;
    }
    const r = await api.fs.list(n.path);
    const children = (r.data ?? []).map(toNode(n.path));
    setTree((prev) => {
      const idx = prev.findIndex((x) => x.path === n.path);
      const copy = [...prev];
      copy.splice(idx + 1, 0, ...children);
      return copy.map((x) => (x.path === n.path ? { ...x, open: true } : x));
    });
  }, []);

  return (
    <div className="glass flex w-56 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-white/8 px-3 py-2 text-[11px] uppercase tracking-wider text-white/40">Explorer</div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {tree.map((n) => (
          <button key={n.path} onClick={() => toggle(n)} className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-white/6">
            <span className="w-3 text-white/30">{n.dir ? (n.open ? '▾' : '▸') : ''}</span>
            <span className={n.dir ? 'text-white/70' : 'text-white/50'}>{n.name}</span>
          </button>
        ))}
      </div>
      {file && (
        <div className="h-[46%] border-t border-white/10">
          <EditorPane path={file} />
        </div>
      )}
    </div>
  );
}
