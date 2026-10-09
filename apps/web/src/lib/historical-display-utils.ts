/**
 * Utilities for displaying historical macro data
 * Ensures consistent ordering (oldest → newest) and frequency-based limits
 */

export type ObservationWithValue = {
  date: string;
  value: number | null;
};

/**
 * Get the latest N observations, ordered chronologically (oldest → newest)
 */
export function getLatestObservations<T extends ObservationWithValue>(
  observations: T[],
  limit: number
): T[] {
  if (observations.length <= limit) {
    return [...observations].sort((a, b) => a.date.localeCompare(b.date));
  }
  // Take the latest N observations
  const latest = observations.slice(-limit);
  // Sort chronologically (oldest → newest)
  return latest.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get frequency-based display limits
 */
export function getFrequencyDisplayLimit(frequency: "D" | "W" | "M" | "Q" | "A"): number {
  const limits: Record<string, number> = {
    D: 20,
    W: 8,
    M: 6,
    Q: 6,
    A: 5,
  };
  return limits[frequency] ?? 6;
}

/**
 * Format a numeric value with appropriate decimals
 */
export function formatMetricValue(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toFixed(decimals);
}

/**
 * Calculate change between two values
 */
export function calculateChange(
  current: number | null,
  previous: number | null,
  decimals = 2
): string {
  if (current === null || previous === null) return "—";
  const change = current - previous;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(decimals)}`;
}

/**
 * Determine trend direction
 */
export function getTrendDirection(
  latest: number | null,
  previous: number | null
): "up" | "down" | "flat" | "unavailable" {
  if (latest === null || previous === null) return "unavailable";
  if (latest > previous) return "up";
  if (latest < previous) return "down";
  return "flat";
}

export function getTrendArrow(direction: "up" | "down" | "flat" | "unavailable"): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "flat":
      return "→";
    default:
      return "—";
  }
}
