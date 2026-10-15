import { cn } from "@/lib/cn";
import { fmtScore, scoreTone, TONE_CHIP } from "@/lib/scale";

type ScoreBadgeProps = {
  score: number | null;
  /** Top of the analysis's score range (2 for Negative/Neutral/Positive). */
  maxLevel: number;
  /** Level name, e.g. "Positive". */
  label?: string | null;
  prefix?: string;
  className?: string;
};

/** An AI sentiment score as a tinted chip: number first, level name second. */
export function ScoreBadge({ score, maxLevel, label, prefix, className }: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        TONE_CHIP[scoreTone(score, maxLevel)],
        className,
      )}
    >
      {prefix ? <span className="font-normal opacity-75">{prefix}</span> : null}
      <span className="font-mono tabular-nums">{score == null ? "–" : fmtScore(score)}</span>
      {score == null ? <span className="font-normal">Not analysed</span> : label ? <span className="font-normal opacity-80">{label}</span> : null}
    </span>
  );
}
