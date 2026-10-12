import { formatShortDate } from '../../utils/date';
import type { DailySeries } from '../dashboard/metrics';

export interface CadenceDataset {
  id: string;
  label: string;
  values: number[];
  axisLabels: Array<{ id: string; label: string }>;
}

function toAxisLabels(series: DailySeries): Array<{ id: string; label: string }> {
  return series.days.map((day) => ({
    id: day,
    label: formatShortDate(new Date(`${day}T00:00:00Z`)),
  }));
}

function toDataset(id: string, series: DailySeries): CadenceDataset {
  return { id, label: id, values: series.values, axisLabels: toAxisLabels(series) };
}

export function buildCadenceDatasets(series: {
  sevenDay: DailySeries;
  thirtyDay: DailySeries;
  ninetyDay: DailySeries;
}): CadenceDataset[] {
  return [
    toDataset('7d', series.sevenDay),
    toDataset('30d', series.thirtyDay),
    toDataset('90d', series.ninetyDay),
  ];
}
