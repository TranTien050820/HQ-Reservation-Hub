export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-[var(--primary)]" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
