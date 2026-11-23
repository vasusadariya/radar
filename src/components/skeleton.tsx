/** Placeholder shown the instant you click a link, while the page loads. */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-200/80 ${className}`} />;
}

export function PageSkeleton({ rows = 4, title = "w-40" }: { rows?: number; title?: string }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Bar className={`h-7 ${title}`} />
        <Bar className="h-4 w-72" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="flex items-center gap-3">
              <Bar className="h-5 w-9 rounded-full" />
              <Bar className="h-5 w-48" />
            </div>
            <Bar className="h-4 w-3/4" />
            <Bar className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
