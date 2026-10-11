import { macroDateLabel } from "@/lib/macro-date-label";
export function MacroObservationTable({
  rows,
  columns,
  daily = false,
}: {
  rows: { date: string; [key: string]: number | string | null | undefined }[];
  columns: { key: string; label: string; number?: boolean }[];
  daily?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="p-2 text-left font-medium">Period</th>
            {columns.map((c) => (
              <th key={c.key} className="p-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.date}
              className={`border-b last:border-0 ${i === rows.length - 1 ? "bg-amber-500/10 font-semibold" : ""}`}
            >
              <th className="p-2 text-left font-medium whitespace-nowrap">
                {macroDateLabel(r.date, daily)}
                {i === rows.length - 1 ? " ◆" : ""}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="p-2 text-right tabular-nums">
                  {typeof r[c.key] === "number"
                    ? c.number
                      ? Number(r[c.key]).toLocaleString("en")
                      : `${Number(r[c.key]).toFixed(2)}%`
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
