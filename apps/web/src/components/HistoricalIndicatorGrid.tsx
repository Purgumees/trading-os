"use client";

import { HistoricalDataDisplay, type HistoricalDataDisplayProps } from "./HistoricalDataDisplay";

export type HistoricalIndicatorGroup = {
  title: string;
  description?: string;
  indicators: HistoricalDataDisplayProps[];
};

export type HistoricalIndicatorGridProps = {
  groups: HistoricalIndicatorGroup[];
  layout?: "single" | "two-column" | "three-column";
};

export function HistoricalIndicatorGrid({
  groups,
  layout = "two-column",
}: HistoricalIndicatorGridProps) {
  const gridClass: Record<string, string> = {
    "single": "grid grid-cols-1",
    "two-column": "grid grid-cols-1 lg:grid-cols-2",
    "three-column": "grid grid-cols-1 lg:grid-cols-3",
  };

  return (
    <div className="space-y-8">
      {groups.map((group, idx) => (
        <div key={`group-${idx}`}>
          {/* Group Header */}
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-100">{group.title}</h3>
            {group.description && (
              <p className="text-sm text-gray-400 mt-1">{group.description}</p>
            )}
          </div>

          {/* Grid of Indicators */}
          <div className={gridClass[layout]}>
            {group.indicators.map((indicator, indIdx) => (
              <HistoricalDataDisplay
                key={`${group.title}-${indIdx}`}
                {...indicator}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
