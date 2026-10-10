import { cn } from 'cn';
import * as React from 'react';
import { buildChartPoints, toPolylinePoints } from '@/lib/chart';

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

interface Props {
  datasets: ChartDataset[];
  defaultDatasetId?: string;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 180;
const CHART_PADDING = 12;
const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1];

export function LineChart({ datasets, defaultDatasetId }: Props) {
  const [activeId, setActiveId] = React.useState(defaultDatasetId ?? datasets[0]?.id ?? '');
  const active = datasets.find((dataset) => dataset.id === activeId) ?? datasets[0];

  if (!active) {
    return null;
  }

  const points = buildChartPoints(active.values, CHART_WIDTH, CHART_HEIGHT, CHART_PADDING);
  const linePoints = toPolylinePoints(points);
  const areaPoints = `${linePoints} ${CHART_WIDTH},${CHART_HEIGHT} 0,${CHART_HEIGHT}`;
  const peak = Math.max(0, ...active.values);

  return (
    <section
      aria-label="Publishing activity"
      className="rounded-lg border border-border bg-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Publishing activity</h2>
        <fieldset className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <legend className="sr-only">Chart range</legend>
          {datasets.map((dataset) => (
            <button
              key={dataset.id}
              type="button"
              onClick={() => setActiveId(dataset.id)}
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
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="mt-6 h-44 w-full text-chart-2"
        role="img"
        aria-label={`Posts published per day over the last ${active.label}, peak ${peak}`}
      >
        {GRID_RATIOS.map((ratio) => {
          const y = CHART_PADDING + ratio * (CHART_HEIGHT - CHART_PADDING * 2);
          return (
            <line
              key={ratio}
              x1={0}
              x2={CHART_WIDTH}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <polygon points={areaPoints} fill="currentColor" opacity={0.08} />
        <polyline
          points={linePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
        {active.axisLabels.map((axisLabel) => (
          <span key={axisLabel.id}>{axisLabel.label}</span>
        ))}
      </div>
    </section>
  );
}
