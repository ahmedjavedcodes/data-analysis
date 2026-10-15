import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const CARD = "rounded-xl border border-border bg-surface shadow-[0_1px_3px_rgba(15,27,51,0.08),0_1px_2px_rgba(15,27,51,0.04)]";

type PanelProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
  children: ReactNode;
};

/** A card with a title row (title + one-line summary on the left, controls on the right). */
export function Panel({ title, description, actions, className, id, children }: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn(CARD, "animate-fade-up scroll-mt-6 p-6", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h2 id={headingId} className="text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Card({ className, children, label }: { className?: string; children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className={cn(CARD, "animate-fade-up p-6", className)}>
      {children}
    </section>
  );
}

export const cardClass = CARD;
