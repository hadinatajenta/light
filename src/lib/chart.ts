export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartRect {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

const TICK_INTERVAL_COUNT = 4;

export function normalizeSeries(values: number[]): number[] {
  if (values.length > 1) {
    return values;
  }

  if (values.length === 1) {
    return [values[0], values[0]];
  }

  return [0, 0];
}

export function niceAxisMax(maxValue: number): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }

  const targetStep = maxValue / TICK_INTERVAL_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = Math.max(1, Math.ceil(targetStep / magnitude) * magnitude);

  return step * TICK_INTERVAL_COUNT;
}

export function buildYAxisTicks(maxValue: number, count = TICK_INTERVAL_COUNT + 1): number[] {
  const axisMax = niceAxisMax(maxValue);

  if (axisMax <= 0) {
    return [0];
  }

  const tickCount = Math.max(2, Math.floor(count));

  return Array.from({ length: tickCount }, (_, index) => (axisMax * index) / (tickCount - 1));
}

export function pickTickIndices(length: number, maxTicks: number): number[] {
  if (length <= 0 || maxTicks < 1) {
    return [];
  }

  const tickCount = Math.min(length, Math.floor(maxTicks));

  if (tickCount === 1) {
    return [0];
  }

  const lastIndex = length - 1;

  return Array.from({ length: tickCount }, (_, position) =>
    Math.round((position * lastIndex) / (tickCount - 1)),
  );
}

export function buildChartPoints(values: number[], rect: ChartRect, axisMax: number): ChartPoint[] {
  const series = normalizeSeries(values);
  const scaleMax = axisMax > 0 ? axisMax : 1;
  const step = rect.width / (series.length - 1);

  return series.map((value, index) => ({
    x: rect.x0 + index * step,
    y: rect.y0 + rect.height - (value / scaleMax) * rect.height,
  }));
}

export function toPolylinePoints(points: ChartPoint[]): string {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
