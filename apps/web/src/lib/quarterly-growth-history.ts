type Observation = { date: string; value: number };
const quarterIndex = (date: string) => {
  const match = /^(\d{4})-Q([1-4])$/.exec(date);
  return match ? +match[1]! * 4 + +match[2]! - 1 : null;
};
const quarterLabel = (index: number) => `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
export function quarterlyGrowthHistory(observations: Observation[], limit = 6) {
  const levels = new Map<number, number>();
  for (const row of observations) {
    const index = quarterIndex(row.date);
    if (index !== null && Number.isFinite(row.value)) levels.set(index, row.value);
  }
  const latest = Math.max(...levels.keys());
  if (!Number.isFinite(latest))
    return { rows: [], year: null, latestQuarter: null, yearToDate: null };
  const change = (index: number, offset: number) => {
    const current = levels.get(index),
      previous = levels.get(index - offset);
    return current !== undefined && previous !== undefined && previous > 0
      ? (current / previous - 1) * 100
      : null;
  };
  const rows = Array.from({ length: limit }, (_, i) => {
    const index = latest - limit + 1 + i;
    return { date: quarterLabel(index), qoq: change(index, 1), yoy: change(index, 4) };
  });
  const year = Math.floor(latest / 4),
    base = levels.get(year * 4 - 1),
    current = levels.get(latest);
  return {
    rows,
    year,
    latestQuarter: quarterLabel(latest),
    yearToDate:
      base !== undefined && base > 0 && current !== undefined ? (current / base - 1) * 100 : null,
  };
}
