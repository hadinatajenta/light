import { cn } from 'cn';
import * as React from 'react';
import {
  buildChartPoints,
  buildYAxisTicks,
  niceAxisMax,
  normalizeSeries,
  pickTickIndices,
  toPolylinePoints,
} from '@/lib/chart';

export interface ChartAxisLabel {
  id: string;
  label: string;
}

export interface ChartDataset {
  id: string;
  label: string;
  values: number[];
  axisLabels: ChartAxisLabel[];
}

export type ChartVariant = 'line' | 'bar';

interface Props {
  datasets: ChartDataset[];
  defaultDatasetId?: string;
  title?: string;
  ariaLabel?: string;
  unitLabel?: string;
  unitSingular?: string;
  metricLabel?: string;
  variant?: ChartVariant;
  onVariantChange?: (variant: ChartVariant) => void;
}

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 260;
const MARGIN_LEFT = 46;
const MARGIN_RIGHT = 14;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 30;
const PLOT_RECT = {
  x0: MARGIN_LEFT,
  y0: MARGIN_TOP,
  width: VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
  height: VIEW_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
};
const PLOT_RIGHT = PLOT_RECT.x0 + PLOT_RECT.width;
const PLOT_BOTTOM = PLOT_RECT.y0 + PLOT_RECT.height;
const TICK_LABEL_RIGHT = `${((MARGIN_LEFT - 10) / VIEW_WIDTH) * 100}%`;
const X_LABEL_TOP = `${(PLOT_BOTTOM / VIEW_HEIGHT) * 100}%`;
const MAX_X_TICKS = 8;
const TOOLTIP_EDGE_RATIO = 0.12;
const TOOLTIP_OFFSET_Y = 8;
const BAR_WIDTH_RATIO = 0.62;
const BAR_RADIUS = 2;

function toPercent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function resolvePointLabel(axisLabels: ChartAxisLabel[], index: number): string {
  return axisLabels[index]?.label ?? `Day ${index + 1}`;
}

function formatUnit(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function formatAverage(total: number, dayCount: number): string {
  return dayCount > 0 ? (total / dayCount).toFixed(1) : '0.0';
}

export function ChartPanel({
  datasets,
  defaultDatasetId,
  title = 'Publishing activity',
  ariaLabel = 'Publishing activity',
  unitLabel = 'posts',
  unitSingular = 'post',
  metricLabel = 'published',
  variant = 'line',
  onVariantChange,
}: Props) {
  const [activeId, setActiveId] = React.useState(defaultDatasetId ?? datasets[0]?.id ?? '');
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const chartTitleId = React.useId();
  const chartDescriptionId = React.useId();
  const active = datasets.find((dataset) => dataset.id === activeId) ?? datasets[0];

  if (!active) {
    return null;
  }

  const series = normalizeSeries(active.values);
  const total = active.values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...series);
  const scaleMax = Math.max(niceAxisMax(peak), 1);
  const points = buildChartPoints(series, PLOT_RECT, scaleMax);
  const viewPoints = points.map((point, index) => ({
    index,
    label: resolvePointLabel(active.axisLabels, index),
    value: series[index],
    x: point.x,
    y: point.y,
  }));
  const yTicks = buildYAxisTicks(peak).map((tickValue) => ({
    value: tickValue,
    y: PLOT_BOTTOM - (tickValue / scaleMax) * PLOT_RECT.height,
  }));
  const xTickIndices = pickTickIndices(viewPoints.length, MAX_X_TICKS);
  const linePoints = toPolylinePoints(points);
  const activePoint = activeIndex === null ? null : viewPoints[activeIndex];
  const highlightPoint = activePoint ?? viewPoints[0];
  const highlightRatio = (highlightPoint.x - PLOT_RECT.x0) / PLOT_RECT.width;
  const tooltipShift =
    highlightRatio < TOOLTIP_EDGE_RATIO ? 0 : highlightRatio > 1 - TOOLTIP_EDGE_RATIO ? -100 : -50;
  const hasActivity = peak > 0;
  const barWidth = (PLOT_RECT.width / Math.max(series.length, 1)) * BAR_WIDTH_RATIO;
  const barPoints = points.map((point, index) => ({
    index,
    x: point.x - barWidth / 2,
    y: point.y,
    height: Math.max(PLOT_BOTTOM - point.y, 0),
    width: barWidth,
  }));

  const handlePointerSelect = (event: React.PointerEvent<HTMLDivElement>) => {
    const svgElement = svgRef.current;

    if (!svgElement) {
      return;
    }

    const bounds = svgElement.getBoundingClientRect();

    if (bounds.width === 0) {
      return;
    }

    const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    const ratio = (viewX - PLOT_RECT.x0) / PLOT_RECT.width;
    const nextIndex = Math.min(
      Math.max(Math.round(ratio * (series.length - 1)), 0),
      series.length - 1,
    );

    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      setActiveIndex(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const lastIndex = series.length - 1;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveIndex((current) => (current === null ? 0 : Math.min(current + 1, lastIndex)));
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveIndex((current) => (current === null ? lastIndex : Math.max(current - 1, 0)));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(lastIndex);
      return;
    }

    if (event.key === 'Escape') {
      setActiveIndex(null);
    }
  };

  return (
    <section aria-label={ariaLabel} className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Total {total} · Peak {peak} · Average {formatAverage(total, series.length)} per day
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {datasets.length > 1 ? (
            <fieldset className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
              <legend className="sr-only">Chart range</legend>
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => {
                    setActiveId(dataset.id);
                    setActiveIndex(null);
                  }}
                  aria-pressed={dataset.id === active.id}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    dataset.id === active.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {dataset.label}
                </button>
              ))}
            </fieldset>
          ) : null}

          {onVariantChange ? (
            <fieldset className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
              <legend className="sr-only">Chart style</legend>
              {(['bar', 'line'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onVariantChange(option)}
                  aria-pressed={option === variant}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    option === variant
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option === 'bar' ? 'Bars' : 'Line'}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>
      </div>

      {hasActivity ? (
        <div
          className="relative mt-5"
          onPointerMove={handlePointerSelect}
          onPointerDown={handlePointerSelect}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={() => setActiveIndex(null)}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the plot is an explorable graphic driven by the arrow keys
            tabIndex={0}
            aria-labelledby={chartTitleId}
            aria-describedby={chartDescriptionId}
            onKeyDown={handleKeyDown}
            onBlur={() => setActiveIndex(null)}
            className="h-auto w-full text-foreground"
          >
            <title id={chartTitleId}>
              {`${title}: ${unitLabel} ${metricLabel} per day over the last ${active.id}`}
            </title>
            <desc id={chartDescriptionId}>
              {`${total} ${unitLabel} in total, peak ${peak} in one day, average ${formatAverage(total, series.length)} per day. ` +
                'Use the left and right arrow keys to step through days, Home and End to jump to either end, and Escape to clear the selection.'}
            </desc>

            {yTicks.map((tick) => (
              <line
                key={tick.value}
                x1={PLOT_RECT.x0}
                x2={PLOT_RIGHT}
                y1={tick.y}
                y2={tick.y}
                stroke="currentColor"
                strokeOpacity={tick.value === 0 ? 0.35 : 0.15}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {variant === 'bar' ? (
              <g>
                {barPoints.map((bar) => (
                  <rect
                    key={bar.index}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx={BAR_RADIUS}
                    className={cn(
                      'transition-opacity duration-150 ease-out',
                      activePoint === null || activePoint.index === bar.index
                        ? 'text-chart-2 opacity-100'
                        : 'text-chart-2 opacity-45',
                    )}
                    fill="currentColor"
                  />
                ))}
              </g>
            ) : (
              <>
                <polygon
                  points={`${linePoints} ${PLOT_RIGHT},${PLOT_BOTTOM} ${PLOT_RECT.x0},${PLOT_BOTTOM}`}
                  className="text-chart-2"
                  fill="currentColor"
                  opacity={0.12}
                />
                <polyline
                  points={linePoints}
                  fill="none"
                  className="text-chart-2"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {viewPoints.map((point) => (
                  <circle
                    key={point.index}
                    cx={point.x}
                    cy={point.y}
                    r={2.5}
                    className="text-chart-2"
                    fill="currentColor"
                  />
                ))}
              </>
            )}

            <g
              className={cn(
                'transition-opacity duration-150 ease-out',
                activePoint ? 'opacity-100' : 'opacity-0',
              )}
            >
              <line
                x1={highlightPoint.x}
                x2={highlightPoint.x}
                y1={PLOT_RECT.y0}
                y2={PLOT_BOTTOM}
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="text-chart-2"
              />
              <circle
                cx={highlightPoint.x}
                cy={highlightPoint.y}
                r={5.5}
                className="text-card"
                fill="currentColor"
              />
              <circle
                cx={highlightPoint.x}
                cy={highlightPoint.y}
                r={3.5}
                className="text-chart-2"
                fill="currentColor"
              />
            </g>
          </svg>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 text-foreground/80 select-none"
          >
            <span className="absolute top-0 left-0 text-[10px] tracking-[0.08em] uppercase">
              {unitLabel}
            </span>

            {yTicks.map((tick) => (
              <span
                key={tick.value}
                className="absolute -translate-x-full -translate-y-1/2 text-[11px] tabular-nums"
                style={{ left: TICK_LABEL_RIGHT, top: toPercent(tick.y, VIEW_HEIGHT) }}
              >
                {tick.value}
              </span>
            ))}

            {xTickIndices.map((index) => (
              <span
                key={index}
                className={cn(
                  'absolute mt-1 text-[11px] tabular-nums',
                  index === 0
                    ? null
                    : index === viewPoints.length - 1
                      ? '-translate-x-full'
                      : '-translate-x-1/2',
                )}
                style={{
                  left: toPercent(viewPoints[index].x, VIEW_WIDTH),
                  top: X_LABEL_TOP,
                }}
              >
                {viewPoints[index].label}
              </span>
            ))}
          </div>

          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium whitespace-nowrap text-popover-foreground tabular-nums shadow-sm transition-opacity duration-150 ease-out',
              activePoint ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              left: toPercent(highlightPoint.x, VIEW_WIDTH),
              top: toPercent(PLOT_RECT.y0, VIEW_HEIGHT),
              transform: `translate(${tooltipShift}%, ${TOOLTIP_OFFSET_Y}px)`,
            }}
          >
            {highlightPoint.label} · {formatUnit(highlightPoint.value, unitSingular, unitLabel)}
          </div>
        </div>
      ) : (
        <p className="mt-5 flex h-40 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
          {`No ${unitLabel} were recorded in this range.`}
        </p>
      )}

      {hasActivity ? (
        <p aria-live="polite" className="sr-only">
          {activePoint
            ? `${activePoint.label}: ${formatUnit(activePoint.value, unitSingular, unitLabel)}`
            : ''}
        </p>
      ) : null}

      {hasActivity ? (
        <table className="sr-only">
          <caption>{`${unitLabel} ${metricLabel} per day over the last ${active.id}`}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{unitLabel}</th>
            </tr>
          </thead>
          <tbody>
            {viewPoints.map((point) => (
              <tr key={point.index}>
                <th scope="row">{point.label}</th>
                <td>{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
