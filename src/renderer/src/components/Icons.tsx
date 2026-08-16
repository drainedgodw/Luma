const paths: Record<string, React.ReactNode> = {
  graph: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 7.2v9.6M8.2 5.7c5 .8 7.6 2.5 7.9 5.1M8.2 18.3c5-.8 7.6-2.5 7.9-5.1" />
    </svg>
  ),
  changes: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="7" cy="6" r="2" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 6h5a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5M18 4.5l2 2-2 2M20 6.5h-4M18 19.5l-2-2 2-2M20 17.5h-4" />
    </svg>
  ),
  folder: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  search: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  ),
  branch: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="6" cy="5" r="2.4" />
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M6 7.4v9.2M18 10.4c0 4-5.5 3.6-8.5 5.1" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  ),
};

export function Icon({ name }: { name: keyof typeof paths | string }) {
  return <>{paths[name] ?? null}</>;
}
