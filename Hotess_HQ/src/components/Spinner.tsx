export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-300">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-[#ef4444]" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
