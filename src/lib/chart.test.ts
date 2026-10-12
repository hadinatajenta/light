import { describe, expect, it } from 'vitest';
import {
  buildChartPoints,
  buildYAxisTicks,
  type ChartRect,
  niceAxisMax,
  normalizeSeries,
  pickTickIndices,
  toPolylinePoints,
} from './chart';

const PEAKS = [0, 1, 3, 5, 12, 37, 120];

const RECT: ChartRect = { x0: 40, y0: 20, width: 300, height: 100 };

describe('niceAxisMax', () => {
  it('keeps a zero peak at zero', () => {
    expect(niceAxisMax(0)).toBe(0);
  });

  it('uses 0..4 for peaks between one and four', () => {
    expect(niceAxisMax(1)).toBe(4);
    expect(niceAxisMax(2)).toBe(4);
    expect(niceAxisMax(3)).toBe(4);
    expect(niceAxisMax(4)).toBe(4);
  });

  it('rounds larger peaks up to a nice step', () => {
    expect(niceAxisMax(5)).toBe(8);
    expect(niceAxisMax(12)).toBe(12);
    expect(niceAxisMax(37)).toBe(40);
    expect(niceAxisMax(120)).toBe(120);
  });

  it('never returns a maximum below the peak', () => {
    for (const peak of PEAKS) {
      expect(niceAxisMax(peak)).toBeGreaterThanOrEqual(peak);
      expect(Number.isInteger(niceAxisMax(peak))).toBe(true);
    }
  });

  it('treats invalid and negative peaks as zero', () => {
    expect(niceAxisMax(-5)).toBe(0);
    expect(niceAxisMax(Number.NaN)).toBe(0);
    expect(niceAxisMax(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('buildYAxisTicks', () => {
  it('returns a single zero tick when nothing was published', () => {
    expect(buildYAxisTicks(0)).toEqual([0]);
  });

  it('returns five whole ticks from zero to the axis maximum', () => {
    expect(buildYAxisTicks(1)).toEqual([0, 1, 2, 3, 4]);
    expect(buildYAxisTicks(3)).toEqual([0, 1, 2, 3, 4]);
    expect(buildYAxisTicks(5)).toEqual([0, 2, 4, 6, 8]);
    expect(buildYAxisTicks(12)).toEqual([0, 3, 6, 9, 12]);
    expect(buildYAxisTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(buildYAxisTicks(120)).toEqual([0, 30, 60, 90, 120]);
  });

  it('honours a custom tick count', () => {
    expect(buildYAxisTicks(12, 3)).toEqual([0, 6, 12]);
  });

  it('ascends from zero to the axis maximum', () => {
    for (const peak of PEAKS) {
      const ticks = buildYAxisTicks(peak);

      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBe(niceAxisMax(peak));

      for (const [index, tick] of ticks.entries()) {
        expect(Number.isFinite(tick)).toBe(true);

        if (index > 0) {
          expect(tick).toBeGreaterThan(ticks[index - 1]);
        }
      }
    }
  });

  it('never returns a non finite tick for invalid input', () => {
    expect(buildYAxisTicks(Number.NaN)).toEqual([0]);
  });
});

describe('pickTickIndices', () => {
  it('returns nothing without data', () => {
    expect(pickTickIndices(0, 8)).toEqual([]);
  });

  it('handles single and paired values', () => {
    expect(pickTickIndices(1, 8)).toEqual([0]);
    expect(pickTickIndices(2, 8)).toEqual([0, 1]);
  });

  it('keeps every index when the range fits the budget', () => {
    expect(pickTickIndices(7, 8)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('thins long ranges evenly and keeps both ends', () => {
    expect(pickTickIndices(30, 8)).toEqual([0, 4, 8, 12, 17, 21, 25, 29]);
    expect(pickTickIndices(90, 8)).toEqual([0, 13, 25, 38, 51, 64, 76, 89]);
  });

  it('spreads monotonically without duplicates or out of range indices', () => {
    for (const length of [1, 2, 7, 30, 90]) {
      const indices = pickTickIndices(length, 8);

      expect(indices.length).toBeLessThanOrEqual(8);
      expect(new Set(indices).size).toBe(indices.length);
      expect(indices[0]).toBe(0);
      expect(indices.at(-1)).toBe(length - 1);

      for (const [position, index] of indices.entries()) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(length);

        if (position > 0) {
          expect(index).toBeGreaterThan(indices[position - 1]);
        }
      }
    }
  });
});

describe('buildChartPoints', () => {
  it('spreads points across the rectangle and scales against the axis maximum', () => {
    const points = buildChartPoints([0, 2, 4], RECT, 4);

    expect(points).toEqual([
      { x: 40, y: 120 },
      { x: 190, y: 70 },
      { x: 340, y: 20 },
    ]);
  });

  it('places the zero case on the baseline and the peak case on the top edge', () => {
    const [zeroPoint, peakPoint] = buildChartPoints([0, 5], RECT, 5);

    expect(zeroPoint.y).toBe(RECT.y0 + RECT.height);
    expect(peakPoint.y).toBe(RECT.y0);
  });

  it('keeps every point inside the rectangle', () => {
    const points = buildChartPoints([0, 3, 1, 4, 0, 2], RECT, 4);

    expect(points).toHaveLength(6);

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(RECT.x0);
      expect(point.x).toBeLessThanOrEqual(RECT.x0 + RECT.width);
      expect(point.y).toBeGreaterThanOrEqual(RECT.y0);
      expect(point.y).toBeLessThanOrEqual(RECT.y0 + RECT.height);
    }
  });

  it('duplicates a single value into a flat line across the rectangle', () => {
    const points = buildChartPoints([3], RECT, 3);

    expect(points).toEqual([
      { x: 40, y: 20 },
      { x: 340, y: 20 },
    ]);
  });

  it('draws an all zero series on the baseline instead of dividing by zero', () => {
    const points = buildChartPoints([0, 0, 0], RECT, niceAxisMax(0));

    for (const point of points) {
      expect(point.y).toBe(RECT.y0 + RECT.height);
    }
  });

  it('returns finite points for empty input', () => {
    const points = buildChartPoints([], RECT, 0);

    expect(points).toEqual([
      { x: 40, y: 120 },
      { x: 340, y: 120 },
    ]);
  });
});

describe('normalizeSeries', () => {
  it('fills empty input with two zeros', () => {
    expect(normalizeSeries([])).toEqual([0, 0]);
  });

  it('duplicates a single value', () => {
    expect(normalizeSeries([7])).toEqual([7, 7]);
  });

  it('passes longer series through untouched', () => {
    expect(normalizeSeries([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('toPolylinePoints', () => {
  it('serializes points with two decimals', () => {
    expect(toPolylinePoints([{ x: 40, y: 120 }])).toBe('40.00,120.00');
    expect(toPolylinePoints(buildChartPoints([0, 2, 4], RECT, 4))).toBe(
      '40.00,120.00 190.00,70.00 340.00,20.00',
    );
  });

  it('returns an empty string without points', () => {
    expect(toPolylinePoints([])).toBe('');
  });
});
