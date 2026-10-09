"use client";

/**
 * Compact historical table for inline display within macro engine sections
 * Shows most recent N observations in chronological order (oldest → newest)
 */

import type { ReactNode } from "react";

export type HistoricalRowData = {
  date: string;
  [key: string]: string | number | null;
};

export type HistoricalTableColumn = {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  format?: (value: any) => string;
};

export type HistoricalTableProps = {
  title?: string;
  columns: HistoricalTableColumn[];
  rows: HistoricalRowData[];
  compact?: boolean;
  children?: ReactNode;
};

export function HistoricalTable({
  title,
  columns,
  rows,
  compact = true,
}: HistoricalTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-xs text-gray-500">
        {title} — No historical data available
      </div>
    );
  }

  const textSizeClass = compact ? "text-xs" : "text-sm";
  const paddingClass = compact ? "py-1 px-2" : "py-2 px-3";

  return (
    <div className="mt-2 overflow-x-auto border border-gray-700 rounded">
      <table className={`w-full ${textSizeClass}`}>
        {title && (
          <caption className="text-left py-2 px-3 text-gray-400 text-xs font-semibold bg-gray-900/50">
            {title}
          </caption>
        )}
        <thead>
          <tr className="border-b border-gray-700 bg-gray-900/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${paddingClass} text-left text-gray-400 font-semibold ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : ""
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.date}-${idx}`}
              className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors"
            >
              {columns.map((col) => {
                const value = row[col.key];
                const formatted = col.format ? col.format(value) : String(value ?? "—");
                return (
                  <td
                    key={`${row.date}-${col.key}`}
                    className={`${paddingClass} text-gray-300 ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : ""
                    }`}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
