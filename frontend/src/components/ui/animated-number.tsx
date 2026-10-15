"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number | null;
  format: (value: number | null) => string;
  durationMs?: number;
  className?: string;
};

/** Eases from the previous value to the new one, so streamed updates tick rather than snap. */
export function AnimatedNumber({ value, format, durationMs = 600, className }: Props) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (value == null || from == null || from === value || reduceMotion) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className={className} aria-live="off">
      {format(shown)}
    </span>
  );
}
