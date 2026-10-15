"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { cn } from "@/lib/cn";
import { checkDarazUrl } from "@/lib/daraz-url";

/** Validates the link instantly, then opens the live analysis page, where progress streams in. */
export function AnalyzeForm() {
  const router = useRouter();
  const inputId = useId();
  const messageId = useId();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const check = checkDarazUrl(value);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    router.push(`/analyze?url=${encodeURIComponent(check.url)}`);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium">
        Daraz product link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setProblem(null);
          }}
          placeholder="https://www.daraz.pk/products/…-i123456789.html"
          aria-invalid={problem !== null}
          aria-describedby={messageId}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-lg border bg-surface px-3.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            problem ? "border-neg" : "border-border",
          )}
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-medium text-ink-text transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Analyse reviews
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      <p id={messageId} aria-live="polite" className="min-h-5 text-sm text-neg-ink">
        {problem}
      </p>
    </form>
  );
}
