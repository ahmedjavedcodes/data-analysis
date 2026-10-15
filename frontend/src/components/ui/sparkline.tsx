"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { cn } from "@/lib/cn";

type Props = {
  values: (number | null)[];
  domain: [number, number];
  color: string;
  label: string;
  height?: string;
};

/** A trend line with a soft gradient fill and no axes: context for a number, not a chart to read. */
export function Sparkline({ values, domain, color, label, height = "h-10" }: Props) {
  const gradientId = useId();
  const data = values.map((v, i) => ({ i, v }));
  if (values.filter((v) => v != null).length < 2) return <div className={height} aria-hidden />;
  return (
    <figure className={cn("w-full", height)} aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={domain} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            connectNulls
            dot={false}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
