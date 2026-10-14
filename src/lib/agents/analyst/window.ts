import { addViewDays, VIEW_DAY_TIME_ZONE, viewDayKey } from '../../analytics/views';

export const ANALYST_WINDOW_DAYS = 28;
export const ANALYST_BASELINE_DAYS = 28;

const JAKARTA_OFFSET = '+07:00';

export interface AnalystWindow {
  start: string;
  end: string;
  baselineStart: string;
  baselineEnd: string;
  startIso: string;
  endExclusiveIso: string;
  baselineStartIso: string;
  baselineEndExclusiveIso: string;
  days: number;
  timeZone: string;
}

export function jakartaDayStartIso(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000${JAKARTA_OFFSET}`).toISOString();
}

export function resolveAnalystWindow(now: Date): AnalystWindow {
  const end = addViewDays(viewDayKey(now), -1);
  const start = addViewDays(end, -(ANALYST_WINDOW_DAYS - 1));
  const baselineEnd = addViewDays(start, -1);
  const baselineStart = addViewDays(baselineEnd, -(ANALYST_BASELINE_DAYS - 1));

  return {
    start,
    end,
    baselineStart,
    baselineEnd,
    startIso: jakartaDayStartIso(start),
    endExclusiveIso: jakartaDayStartIso(addViewDays(end, 1)),
    baselineStartIso: jakartaDayStartIso(baselineStart),
    baselineEndExclusiveIso: jakartaDayStartIso(addViewDays(baselineEnd, 1)),
    days: ANALYST_WINDOW_DAYS,
    timeZone: VIEW_DAY_TIME_ZONE,
  };
}
