import { useEffect } from 'react';
import { useStore } from '../store';

export default function Toast() {
  const { toast, setToast } = useStore();
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(t);
    }
  }, [toast, setToast]);
  if (!toast) return null;
  return (
    <div className="glass anim-in fixed bottom-5 left-1/2 z-50 max-w-[560px] -translate-x-1/2 border-rose/40 px-4 py-3 text-sm text-rose">
      {toast}
    </div>
  );
}
