import { ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { fmtPrice, fmtStars } from "@/lib/scale";

export type HeaderProduct = {
  name: string;
  category_breadcrumb: string;
  price: number | null;
  overall_rating: number | null;
  rating_count: number;
  url: string;
};

type Props = {
  product: HeaderProduct;
  /** One line under the title, e.g. "78 reviews analysed · 15 Oct 2026". */
  subtitle?: string;
  notices?: string[];
  children?: ReactNode;
};

export function ProductHeader({ product, subtitle, notices = [], children }: Props) {
  const crumbs = product.category_breadcrumb.split(">").map((c) => c.trim()).filter(Boolean);
  return (
    <header className="animate-fade-up space-y-5">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <li>
            <Link href="/" className="hover:text-text focus-visible:outline-2 focus-visible:outline-ring">
              Analyses
            </Link>
          </li>
          {crumbs.slice(-2).map((c, i) => (
            <li key={`${c}-${i}`} className="flex items-center gap-1.5">
              <span aria-hidden className="text-subtle">/</span>
              {c}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{product.name}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-mono text-sm font-semibold tabular-nums">
            {fmtPrice(product.price)}
          </span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm">
            <Star className="size-3.5 fill-star text-star" aria-hidden />
            <span className="font-mono font-semibold tabular-nums">{fmtStars(product.overall_rating)}</span>
            <span className="text-muted">· {product.rating_count.toLocaleString()} ratings</span>
          </span>
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View on Daraz
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>

      {notices.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-neu/30 bg-neu-soft px-4 py-3 text-sm text-neu-ink" role="status">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {children}
    </header>
  );
}
