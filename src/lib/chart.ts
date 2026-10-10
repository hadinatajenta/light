export interface ChartPoint {
  x: number;
  y: number;
}

export function normalizeSeries(values: number[]): number[] {
  if (values.length > 1) {
    return values;
  }

  if (values.length === 1) {
    return [values[0], values[0]];
  }

  return [0, 0];
}

export function buildChartPoints(
  values: number[],
  width: number,
  height: number,
  padding = 4,
): ChartPoint[] {
  const series = normalizeSeries(values);
  const maxValue = Math.max(1, ...series);
  const step = width / (series.length - 1);
  const plotHeight = height - padding * 2;

  return series.map((value, index) => ({
    x: index * step,
    y: height - padding - (value / maxValue) * plotHeight,
  }));
}

export function toPolylinePoints(points: ChartPoint[]): string {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
