"use client";

import { useState } from "react";
import { formatVisualValue, type VisualPoint } from "@/lib/chat/interactive-visual";

const palette = ["#0087ed", "#8849ec", "#f76a20", "#00af58", "#f44242", "#e9ac00", "#eb5a9d"];
const width = 640;
const height = 245;
const plot = { left: 76, right: 606, top: 14, bottom: 205 };

function axisLabel(value: number) {
  return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 });
}

function yDomain(points: VisualPoint[], includeZero: boolean) {
  const values = points.map(({ y }) => y);
  if (includeZero) values.push(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return [min - 1, max + 1];
  const raw = (max - min) / 4;
  if (raw < 1e-100) return [min, max];
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  const lower = Math.floor(min / step) * step;
  return [lower, lower + step * (max <= lower + 4 * step ? 4 : 5), max <= lower + 4 * step ? 4 : 5];
}

export function InteractiveVisualChart({ points, kind, title, series, colorful }: {
  points: VisualPoint[] | null;
  kind: "bar" | "line" | "scatter" | "pie";
  title?: string;
  series?: string;
  colorful?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  if (!points?.length) return <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Chart data unavailable.</p>;

  const activeIndex = hovered ?? focused;
  const active = activeIndex === null ? undefined : points[activeIndex];
  const color = (index: number) => colorful || kind === "pie" ? palette[index % palette.length] : palette[0];
  const mark = (point: VisualPoint, index: number) => ({
    tabIndex: 0,
    role: "img",
    "aria-label": `${point.label}: ${kind === "scatter" ? `${formatVisualValue(point.x)}, ` : ""}${formatVisualValue(point.y)}`,
    className: "focus-visible:outline-2 focus-visible:outline-ring",
    onFocus: () => setFocused(index),
    onBlur: () => setFocused(null),
    onPointerEnter: () => setHovered(index),
    onPointerLeave: () => setHovered(null),
  });
  const pieTotal = points.reduce((sum, point) => sum + point.y, 0);
  let pieOffset = 0;

  const [minY, maxY, intervals = 4] = yDomain(points, kind === "bar");
  const scaleY = (y: number) => plot.bottom - ((y - minY) / (maxY - minY)) * (plot.bottom - plot.top);
  const slot = (plot.right - plot.left) / points.length;
  const xValues = points.map(({ x }) => x);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const scaleX = (index: number) => kind === "scatter"
    ? plot.left + 7 + ((maxX === minX ? 0.5 : (points[index].x - minX) / (maxX - minX)) * (plot.right - plot.left - 14))
    : plot.left + slot * (index + 0.5);
  const tickStride = Math.max(1, Math.ceil(points.length / 7));
  const accessibleTitle = title ?? series ?? `${kind} chart`;

  return (
    <figure className="min-w-0 rounded-2xl border border-border/70 bg-background px-2 pb-3 pt-3 sm:px-3" aria-label={accessibleTitle}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible text-muted-foreground [--chart-label:22px] sm:[--chart-label:16px]"
        role="group"
        aria-label={accessibleTitle}
      >
        {kind === "pie" ? points.map((point, index) => {
          if (point.y === 0) return null;
          const length = point.y / pieTotal * 100;
          const offset = pieOffset;
          pieOffset += length;
          return <circle key={index} {...mark(point, index)} cx="320" cy="120" r="69" pathLength="100" fill="none"
            transform="rotate(-90 320 120)" stroke={color(index)} strokeWidth="78"
            strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-offset} />;
        }) : (
          <>
            {Array.from({ length: intervals + 1 }, (_, index) => {
              const value = minY + (maxY - minY) * index / intervals;
              const y = scaleY(value);
              return (
                <g key={index} aria-hidden="true">
                  <line x1={plot.left} x2={plot.right} y1={y} y2={y} className="stroke-border" strokeDasharray={index ? "3 3" : undefined} />
                  <text x={plot.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="currentColor" fontSize="var(--chart-label)">{axisLabel(value)}</text>
                </g>
              );
            })}
            {kind === "scatter" ? Array.from({ length: maxX === minX ? 1 : 5 }, (_, index) => {
              const fraction = maxX === minX ? 0.5 : index / 4;
              const x = plot.left + 7 + fraction * (plot.right - plot.left - 14);
              return <text key={index} x={x} y={229} textAnchor="middle" fill="currentColor" fontSize="var(--chart-label)" aria-hidden="true">
                {axisLabel(minX + fraction * (maxX - minX))}
              </text>;
            }) : points.map((point, index) => index % tickStride === 0 && (
              <text key={index} x={scaleX(index)} y={229} textAnchor="middle" fill="currentColor" fontSize="var(--chart-label)" aria-hidden="true">
                {point.label.length > 8 ? `${point.label.slice(0, 7)}…` : point.label}
              </text>
            ))}
            {kind === "line" && <polyline points={points.map((point, index) => `${scaleX(index)},${scaleY(point.y)}`).join(" ")} fill="none" stroke={palette[0]} strokeWidth="2.5" />}
            {points.map((point, index) => {
              const x = scaleX(index);
              const y = scaleY(point.y);
              if (kind !== "bar") return <circle key={index} {...mark(point, index)} cx={x} cy={y} r={activeIndex === index ? 7 : 5} fill={color(index)} />;
              const base = scaleY(0);
              const barWidth = slot * 0.8;
              return <rect key={index} {...mark(point, index)} x={x - barWidth / 2}
                y={Math.min(y, base) - (y === base ? 1 : 0)} width={barWidth} height={Math.max(2, Math.abs(base - y))}
                rx={Math.min(5, barWidth / 4)} fill={color(index)} opacity={activeIndex === index ? 0.76 : 1} />;
            })}
          </>
        )}
      </svg>
      {kind === "pie" && pieTotal <= 0 && <p className="pb-2 text-center text-sm text-muted-foreground">No positive values to chart.</p>}
      <figcaption className="min-h-5 break-words text-center text-xs text-muted-foreground">
        {active ? (
          <span role="status">{active.label} · {kind === "scatter" && `${formatVisualValue(active.x)}, `}{formatVisualValue(active.y)}</span>
        ) : kind === "pie" && pieTotal > 0 ? (
          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {points.map((point, index) => <li key={index} className="inline-flex max-w-full items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color(index) }} />{point.label}
            </li>)}
          </ul>
        ) : series && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: palette[0] }} />{series}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
