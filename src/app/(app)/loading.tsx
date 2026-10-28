export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-200/70" />)}</div>
      <div className="h-72 rounded-xl bg-slate-200/60" />
    </div>
  );
}
