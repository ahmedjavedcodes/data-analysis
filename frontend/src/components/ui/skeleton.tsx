import { cardClass } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/** A block with a soft light sweep across it, for content that has not streamed in yet. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden rounded-lg bg-surface-2", className)}>
      <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-(--shimmer) to-transparent" />
    </div>
  );
}

/** A card-shaped placeholder with its title, so the layout does not jump when data arrives. */
export function SkeletonPanel({ title, note, height = "h-64", className }: { title: string; note?: string; height?: string; className?: string }) {
  return (
    <section aria-busy aria-label={`${title} (loading)`} className={cn(cardClass, "p-6", className)}>
      <p className="text-[15px] font-semibold tracking-tight text-muted">{title}</p>
      {note ? <p className="mt-0.5 text-sm text-subtle">{note}</p> : null}
      <Skeleton className={cn("mt-5 w-full", height)} />
    </section>
  );
}
