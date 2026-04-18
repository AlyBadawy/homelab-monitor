import { useMemo, useRef, useState } from 'react';
import type { HistoryPoint } from '../lib/api';

export interface HistoryChartSeries {
  key: string;
  label: string;
  points: HistoryPoint[];
  stroke: string;
  fill?: string;
  /** Formatter for the value in the tooltip / y-axis. */
  format: (v: number) => string;
}

interface HistoryChartProps {
  title: string;
  series: HistoryChartSeries[];
  height?: number;
  /** Pin lower bound to 0 (e.g. percentages, rates). */
  baselineZero?: boolean;
  /** If set, clamps upper bound to this number (e.g. 100 for percentages). */
  ceiling?: number;
  /** Right-side hint shown next to the title. */
  hint?: string;
}

/**
 * A bigger multi-series line chart for the detail drawer — hand-rolled SVG,
 * with axis ticks, grid lines, and a shared hover cursor that shows the
 * value for every series at the nearest x position.
 */
export function HistoryChart({
  title,
  series,
  height = 180,
  baselineZero = true,
  ceiling,
  hint,
}: HistoryChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);

  const hasAny = series.some((s) => s.points.length >= 2);

  // Establish a shared time domain across series so cursors line up.
  const { tMin, tMax, vMin, vMax } = useMemo(() => {
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.ts < tMin) tMin = p.ts;
        if (p.ts > tMax) tMax = p.ts;
        if (p.value < vMin) vMin = p.value;
        if (p.value > vMax) vMax = p.value;
      }
    }
    if (!Number.isFinite(tMin)) tMin = 0;
    if (!Number.isFinite(tMax)) tMax = 1;
    if (!Number.isFinite(vMin)) vMin = 0;
    if (!Number.isFinite(vMax)) vMax = 1;
    if (baselineZero && vMin > 0) vMin = 0;
    if (typeof ceiling === 'number' && vMax < ceiling) vMax = ceiling;
    if (vMin === vMax) vMax = vMin + 1;
    return { tMin, tMax, vMin, vMax };
  }, [series, baselineZero, ceiling]);

  // Layout: reserve left gutter for y-labels, bottom gutter for x-labels.
  const padding = { top: 8, right: 12, bottom: 22, left: 48 };
  const width = 900; // logical width; SVG scales responsively via viewBox.
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xFromTs = (ts: number) =>
    padding.left + ((ts - tMin) / Math.max(1, tMax - tMin)) * plotW;
  const yFromVal = (v: number) =>
    padding.top + (1 - (v - vMin) / Math.max(1e-9, vMax - vMin)) * plotH;

  // Build a flat index of unique x-positions for hover snap.
  // Uses the longest series as the index (best resolution).
  const longest = series.reduce<HistoryPoint[]>(
    (acc, s) => (s.points.length > acc.length ? s.points : acc),
    [] as HistoryPoint[],
  );

  const yTicks = useMemo(
    () => niceTicks(vMin, vMax, 4),
    [vMin, vMax],
  );
  const xTicks = useMemo(
    () => timeTicks(tMin, tMax, 4),
    [tMin, tMax],
  );

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || longest.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const xPx = (e.clientX - rect.left) * scaleX;
    if (xPx < padding.left || xPx > padding.left + plotW) {
      setHover(null);
      return;
    }
    const ratio = (xPx - padding.left) / plotW;
    const targetTs = tMin + ratio * (tMax - tMin);
    // Find nearest point in the longest series.
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < longest.length; i++) {
      const d = Math.abs(longest[i].ts - targetTs);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }
    const snapX = xFromTs(longest[bestIdx].ts);
    setHover({ x: snapX, idx: bestIdx });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-800/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="card-title">{title}</span>
          {hint && (
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
              {hint}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em]"
            >
              <span
                className="inline-block h-0.5 w-3 rounded"
                style={{ backgroundColor: s.stroke }}
              />
              <span className="text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        {!hasAny && (
          <div className="flex items-center justify-center py-10 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-text-dim">
            no history yet — collecting samples…
          </div>
        )}

        {hasAny && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height }}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Grid + y-axis ticks */}
            {yTicks.map((t) => {
              const y = yFromVal(t);
              return (
                <g key={`y-${t}`}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeDasharray="2 3"
                    strokeWidth={0.5}
                  />
                  <text
                    x={padding.left - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-current text-text-dim"
                    style={{
                      fontSize: 10,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {series[0] ? series[0].format(t) : t.toFixed(0)}
                  </text>
                </g>
              );
            })}

            {/* x-axis ticks */}
            {xTicks.map((t) => {
              const x = xFromTs(t);
              return (
                <g key={`x-${t}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={padding.top}
                    y2={height - padding.bottom}
                    stroke="currentColor"
                    className="text-border/50"
                    strokeDasharray="1 4"
                    strokeWidth={0.5}
                  />
                  <text
                    x={x}
                    y={height - padding.bottom + 12}
                    textAnchor="middle"
                    className="fill-current text-text-dim"
                    style={{
                      fontSize: 10,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {fmtClock(t, tMax - tMin)}
                  </text>
                </g>
              );
            })}

            {/* Series */}
            {series.map((s) => {
              if (s.points.length < 2) return null;
              const d = buildPath(s.points, xFromTs, yFromVal);
              const area = s.fill
                ? `${d} L ${xFromTs(s.points[s.points.length - 1].ts).toFixed(
                    2,
                  )} ${(height - padding.bottom).toFixed(2)} L ${xFromTs(
                    s.points[0].ts,
                  ).toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`
                : null;
              return (
                <g key={s.key}>
                  {area && <path d={area} fill={s.fill} stroke="none" />}
                  <path
                    d={d}
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Hover cursor */}
            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="currentColor"
                  className="text-accent-cyan/60"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                {series.map((s) => {
                  // Find nearest point in this series at the hovered ts.
                  const ts = longest[hover.idx]?.ts;
                  if (ts === undefined) return null;
                  const p = nearestPoint(s.points, ts);
                  if (!p) return null;
                  return (
                    <circle
                      key={`h-${s.key}`}
                      cx={xFromTs(p.ts)}
                      cy={yFromVal(p.value)}
                      r={3}
                      fill={s.stroke}
                      stroke="var(--tw-bg-900, #0b0f14)"
                      strokeWidth={1.25}
                    />
                  );
                })}
              </>
            )}
          </svg>
        )}

        {hover && hasAny && (
          // Flip the tooltip to the left side of the cursor once we're past
          // the middle of the chart, so it never overflows the card.
          (() => {
            const pct = (hover.x / width) * 100;
            const flip = pct > 55;
            return (
              <div
                className="pointer-events-none absolute top-1 rounded-md border border-border bg-bg-900/90 px-2 py-1 font-mono text-[0.65rem] backdrop-blur-sm"
                style={
                  flip
                    ? { right: `calc(${100 - pct}% + 8px)`, maxWidth: '45%' }
                    : { left: `calc(${pct}% + 8px)`, maxWidth: '45%' }
                }
              >
                <div className="text-text-dim">
                  {fmtFullClock(longest[hover.idx]?.ts ?? 0)}
                </div>
                {series.map((s) => {
                  const ts = longest[hover.idx]?.ts;
                  if (ts === undefined) return null;
                  const p = nearestPoint(s.points, ts);
                  if (!p) return null;
                  return (
                    <div
                      key={`t-${s.key}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span style={{ color: s.stroke }}>{s.label}</span>
                      <span className="text-text">{s.format(p.value)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function buildPath(
  points: HistoryPoint[],
  xFromTs: (ts: number) => number,
  yFromVal: (v: number) => number,
): string {
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    d +=
      (i === 0 ? 'M' : 'L') +
      xFromTs(p.ts).toFixed(2) +
      ' ' +
      yFromVal(p.value).toFixed(2) +
      ' ';
  }
  return d.trim();
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (count * step) / range;
  let mult = 1;
  if (err <= 0.15) mult = 10;
  else if (err <= 0.35) mult = 5;
  else if (err <= 0.75) mult = 2;
  const niceStep = mult * step;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += niceStep) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

function timeTicks(tMin: number, tMax: number, count: number): number[] {
  if (tMax <= tMin) return [tMin];
  const step = (tMax - tMin) / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(tMin + step * i);
  return out;
}

function fmtClock(ts: number, spanMs: number): string {
  const d = new Date(ts);
  // Long spans (>= 2 days) get date + hour; otherwise just HH:MM.
  if (spanMs >= 48 * 3600 * 1000) {
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtFullClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nearestPoint(
  points: HistoryPoint[],
  ts: number,
): HistoryPoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Math.abs(best.ts - ts);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].ts - ts);
    if (d < bestD) {
      best = points[i];
      bestD = d;
    }
  }
  return best;
}

