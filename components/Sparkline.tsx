"use client";

import { useId } from "react";
import type { Tone } from "@/lib/types";

export function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  const id = useId().replace(/:/g, "");
  const width = 88;
  const height = 32;

  if (values.length < 2) {
    return <svg className="spark" width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 2) + 1;
    const y = height - 3 - ((value - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const line = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord[0].toFixed(2)} ${coord[1].toFixed(2)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const fill = `${line} L${last[0].toFixed(2)} ${height} L${first[0].toFixed(2)} ${height} Z`;
  const color =
    tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--faint)";

  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
