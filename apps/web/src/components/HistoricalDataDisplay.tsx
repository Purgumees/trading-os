"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export type HistoricalObservation = {
  date: string;
  value: number | null;
  unit?: string;
  flag?: string | null;
};

export type HistoricalDataDisplayProps = {
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  latestDate: string | null;
  unit: string;
  frequency: "D" | "W" | "M" | "Q" | "A";
  observations: HistoricalObservation[];
  source: string;
  sourceUrl?: string;
  freshness: "current" | "stale" | "unavailable";
  trend?: "up" | "down" | "flat";
  maxVisibleRows?: number;
  children?: ReactNode;
};

const getDisplayLimit = (frequency: string, defaultLimit: number): number => {
  const limits: Record<string, number> = {
    D: 20,
    W: 8,
    M: 6,
    Q: 6,
    A: 5,
  };
  return limits[frequency] || defaultLimit;
};

const formatChange = (current: number | null, previous: number | null): string => {
  if (current === null || previous === null) return "—";
  const change = current - previous;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}`;
};

const formatValue = (value: number | null, decimals = 2): string => {
  if (value === null) return "—";
  return value.toFixed(decimals);
};

export function HistoricalDataDisplay({
  label,
  currentValue,
  previousValue,
  latestDate,
  unit,
  frequency,
  observations,
  source,
  sourceUrl,
  freshness,
  trend,
  maxVisibleRows = 6,
  children,
}: HistoricalDataDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayLimit = getDisplayLimit(frequency, maxVisibleRows);
  const visibleObs = observations.slice(0, displayLimit);
  const hasMore = observations.length > displayLimit;

  const change = formatChange(currentValue, previousValue);
  const currentStr = formatValue(currentValue);
  const previousStr = formatValue(previousValue);

  const freshnessColor: Record<string, string> = {
    current: "text-green-500",
    stale: "text-yellow-500",
    unavailable: "text-red-500",
  };

  const trendIcon: Record<string, string> = {
    up: "↑",
    down: "↓",
    flat: "→",
  };

  return (
    <div className="border border-gray-700 rounded-lg p-4 bg-gray-900 mb-4">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-200">{label}</h4>
          <p className="text-xs text-gray-400 mt-1">
            Latest: {latestDate ? `${latestDate}` : "—"} {trend && `${trendIcon[trend]}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white">
            {currentStr}
            <span className="text-sm text-gray-400 ml-1">{unit}</span>
          </p>
          <p className={`text-xs ${change.startsWith("+") ? "text-green-400" : change.startsWith("-") ? "text-red-400" : "text-gray-400"}`}>
            {change} {unit}
          </p>
        </div>
      </div>

      {/* Metadata Row */}
      <div className="flex gap-2 mb-3 text-xs text-gray-400 flex-wrap">
        <span className={`px-2 py-1 rounded bg-gray-800 ${freshnessColor[freshness]}`}>
          {freshness}
        </span>
        <span className="px-2 py-1 rounded bg-gray-800">Freq: {frequency}</span>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-blue-400"
        >
          {source}
        </a>
      </div>

      {/* Historical Table */}
      {visibleObs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-2 text-gray-400">Date</th>
                <th className="text-right py-2 px-2 text-gray-400">Value</th>
                <th className="text-right py-2 px-2 text-gray-400">Change</th>
              </tr>
            </thead>
            <tbody>
              {visibleObs.map((obs, idx) => {
                const nextObs = observations[idx + 1];
                const obsChange = formatChange(obs.value, nextObs?.value ?? null);
                const changeColor =
                  obsChange.startsWith("+") ? "text-green-400" : obsChange.startsWith("-") ? "text-red-400" : "text-gray-400";

                return (
                  <tr key={`${obs.date}-${idx}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 px-2 text-gray-300">{obs.date}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{formatValue(obs.value)}</td>
                    <td className={`text-right py-2 px-2 ${changeColor}`}>{obsChange}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expand Button */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-3 py-2 text-xs text-blue-400 hover:text-blue-300 border-t border-gray-700 pt-3"
        >
          {isExpanded ? "Show less" : `Show more (${observations.length - displayLimit} more)`}
        </button>
      )}

      {/* Expanded View */}
      {isExpanded && hasMore && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {observations.slice(displayLimit).map((obs, idx) => {
                const nextObs = observations[displayLimit + idx + 1];
                const obsChange = formatChange(obs.value, nextObs?.value ?? null);
                const changeColor =
                  obsChange.startsWith("+") ? "text-green-400" : obsChange.startsWith("-") ? "text-red-400" : "text-gray-400";

                return (
                  <tr key={`${obs.date}-expanded-${idx}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 px-2 text-gray-400">{obs.date}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatValue(obs.value)}</td>
                    <td className={`text-right py-2 px-2 ${changeColor}`}>{obsChange}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Children Content */}
      {children && <div className="mt-4 border-t border-gray-700 pt-4">{children}</div>}

      {/* Empty State */}
      {observations.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No historical observations available</p>
      )}
    </div>
  );
}
