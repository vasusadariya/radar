import { Bar } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]" aria-busy="true" aria-label="Loading">
      <div className="space-y-5">
        <div className="space-y-2">
          <Bar className="h-4 w-16" />
          <Bar className="h-8 w-56" />
          <Bar className="h-4 w-80" />
        </div>
        <div className="card p-4"><Bar className="h-9 w-40" /></div>
        <div className="card space-y-2 p-4"><Bar className="h-5 w-32" /><Bar className="h-4 w-full" /><Bar className="h-4 w-5/6" /></div>
        <div className="card space-y-2 p-4"><Bar className="h-5 w-24" /><Bar className="h-4 w-2/3" /></div>
      </div>
      <div className="space-y-4">
        <div className="card space-y-2 p-4"><Bar className="h-5 w-full" /><Bar className="h-4 w-3/4" /><Bar className="h-4 w-1/2" /></div>
        <div className="card space-y-2 p-4"><Bar className="h-4 w-full" /><Bar className="h-4 w-full" /></div>
      </div>
    </div>
  );
}
