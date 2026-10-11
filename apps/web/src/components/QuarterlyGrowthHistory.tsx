import { quarterlyGrowthHistory } from "@/lib/quarterly-growth-history";
const percent = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
export function QuarterlyGrowthHistory({
  observations,
  label,
}: {
  observations: { date: string; value: number }[];
  label: string;
}) {
  const history = quarterlyGrowthHistory(observations);
  if (!history.rows.length)
    return (
      <p className="mt-3 text-sm text-muted-foreground">Quarterly growth history unavailable.</p>
    );
  return (
    <div className="mt-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">
          {history.year} so far · {label}
        </p>
        <p className="mt-1 text-xl font-semibold">{percent(history.yearToDate)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {history.latestQuarter} compared with {history.year! - 1}-Q4. Cumulative change so far,
          not a full-year growth rate.
        </p>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
            Latest 6 quarters · growth, not euro amounts
          </caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="p-2 text-left font-medium">Quarter</th>
              <th className="p-2 text-right font-medium">QoQ growth</th>
              <th className="p-2 text-right font-medium">YoY growth</th>
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <tr
                key={row.date}
                className={`border-b last:border-0 ${row.date.startsWith(String(history.year)) ? "bg-muted/40" : ""}`}
              >
                <th className="p-2 text-left font-medium">{row.date}</th>
                <td className="p-2 text-right tabular-nums">{percent(row.qoq)}</td>
                <td className="p-2 text-right tabular-nums">{percent(row.yoy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        QoQ: vs previous quarter. YoY: vs the same quarter last year. Positive = expansion; negative
        = contraction. Latest published quarter: {history.latestQuarter}; later quarters are not yet
        shown.
      </p>
    </div>
  );
}
