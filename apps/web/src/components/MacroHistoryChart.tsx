"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartRow = { date: string; [key: string]: string | number | null | undefined };
const colors = ["#38bdf8", "#a78bfa", "#34d399"];
export function MacroHistoryChart({
  rows,
  series,
  title,
  unit = "",
}: {
  rows: ChartRow[];
  series: { key: string; label: string }[];
  title: string;
  unit?: string;
}) {
  const data = [...rows].filter((row) => row.date);
  if (data.every((row) => /^\d{4}/.test(row.date)))
    data.sort((a, b) => a.date.localeCompare(b.date));
  if (!data.some((row) => series.some((s) => typeof row[s.key] === "number"))) return null;
  const latest = Object.fromEntries(
    series.map((s) => [s.key, data.findLastIndex((row) => typeof row[s.key] === "number")]),
  );
  return (
    <figure
      className="my-4 min-w-0 rounded-xl border bg-muted/20 p-3"
      aria-label={`${title} chart`}
    >
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">
          {title}
          {unit ? ` · ${unit}` : ""}
        </span>
        <span className="font-semibold text-amber-500">◆ Latest published point</span>
      </figcaption>
      <div className="h-52 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 16, bottom: 4, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="currentColor" opacity={0.12} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              width={52}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v) => Number(v).toLocaleString("en", { maximumFractionDigits: 2 })}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                borderColor: "#334155",
                color: "#f8fafc",
                borderRadius: 8,
              }}
              formatter={(v, name) => [
                typeof v === "number"
                  ? `${v.toLocaleString("en", { maximumFractionDigits: 3 })}${unit === "%" ? "%" : ""}`
                  : "Unavailable",
                name,
              ]}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={colors[i % colors.length]}
                strokeWidth={2.5}
                connectNulls={false}
                isAnimationActive={false}
                dot={(props: any) => {
                  const { cx, cy, index, value } = props;
                  if (typeof value !== "number" || cx == null || cy == null)
                    return <g key={`${s.key}-${index}`} />;
                  return index === latest[s.key] ? (
                    <path
                      key={`${s.key}-${index}`}
                      d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
                      fill="#f59e0b"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      key={`${s.key}-${index}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={colors[i % colors.length]}
                    />
                  );
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <span key={s.key}>
            <span style={{ color: colors[i % colors.length] }}>● </span>
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
