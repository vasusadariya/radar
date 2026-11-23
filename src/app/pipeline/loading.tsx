import { Bar } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Bar className="h-7 w-32" /><Bar className="h-4 w-72" /></div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-60 shrink-0 space-y-2 rounded-xl border border-zinc-200 bg-zinc-100/60 p-2">
            <Bar className="h-4 w-24" />
            <Bar className="h-16 w-full" />
            <Bar className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
