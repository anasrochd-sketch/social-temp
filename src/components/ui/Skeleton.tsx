import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-cova-pale", className)} />
  );
}

export function CardGridSkeleton({
  count = 6,
  label = "Loading",
}: {
  count?: number;
  /** Accessible name; pass a translated string when available. */
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-cova-line bg-white p-5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
