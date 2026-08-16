import { useWorkspace } from '../workspace';
import CodeEditor from '../components/CodeEditor';

export default function EditorWorkspace() {
  const { active } = useWorkspace();
  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      {active ? (
        <CodeEditor path={active} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <div className="text-5xl opacity-20">⌘</div>
          <div className="text-sm text-white/40">No file open</div>
          <div className="text-xs text-white/25">Pick a file in the Explorer, or open one from Changes</div>
        </div>
      )}
    </div>
  );
}
