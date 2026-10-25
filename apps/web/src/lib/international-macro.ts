import { parseCsv } from "@luxalgo/journal-importers";
export const countries = {
  jpy: {
    name: "Japan",
    flag: "🇯🇵",
    area: "JP",
    bank: "Bank of Japan",
    gdp: "JPNRGDPEXP",
    labour: "LRHUTTTTJPM156S",
    quarterlyCpi: false,
    quarterlyLabour: false,
    employment: "LFEMTTTTJPM647S",
    quarterlyEmployment: false,
  },
  aud: {
    name: "Australia",
    flag: "🇦🇺",
    area: "AU",
    bank: "Reserve Bank of Australia",
    gdp: "NGDPRSAXDCAUQ",
    labour: "LRHUTTTTAUM156S",
    // ABS publishes monthly headline CPI; do not discard non-quarter-end observations.
    quarterlyCpi: false,
    quarterlyLabour: false,
    employment: "LFEMTTTTAUM647S",
    quarterlyEmployment: false,
  },
  gbp: {
    name: "United Kingdom",
    flag: "🇬🇧",
    area: "GB",
    bank: "Bank of England",
    gdp: "NGDPRSAXDCGBQ",
    labour: "LRHUTTTTGBM156S",
    quarterlyCpi: false,
    quarterlyLabour: false,
    employment: "LFEMTTTTGBQ647S",
    quarterlyEmployment: true,
  },
  cad: {
    name: "Canada",
    flag: "🇨🇦",
    area: "CA",
    bank: "Bank of Canada",
    gdp: "NGDPRSAXDCCAQ",
    labour: "LRHUTTTTCAM156S",
    quarterlyCpi: false,
    quarterlyLabour: false,
    employment: "LFEMTTTTCAM647S",
    quarterlyEmployment: false,
  },
  nzd: {
    name: "New Zealand",
    flag: "🇳🇿",
    area: "NZ",
    bank: "Reserve Bank of New Zealand",
    gdp: "",
    labour: "LRHUTTTTNZQ156S",
    quarterlyCpi: true,
    quarterlyLabour: true,
    employment: "LFEMTTTTNZQ647S",
    quarterlyEmployment: true,
  },
} as const;
export type Country = keyof typeof countries;
export type Observation = { date: string; value: number };
export type CountryData = {
  employment?: Observation[];
  policy: Observation[];
  inflation: { date: string; yoy: number; change: number | null }[];
  gdp: Observation[];
  labour: Observation[];
  errors: string[];
  fetchedAt: string;
  gdpSource: string;
};
export const quarter = (date: string) =>
  `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
export function csvRecords(content: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(content.replace(/^\uFEFF/, ""));
  if (!header) return [];
  return rows
    .filter((row) => row.length === header.length)
    .map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}
export function bisObservations(content: string, area: string, measure: string): Observation[] {
  return csvRecords(content)
    .filter(
      (r) =>
        r.REF_AREA === area &&
        r.UNIT_MEASURE === measure &&
        r.OBS_VALUE?.trim() &&
        Number.isFinite(Number(r.OBS_VALUE)),
    )
    .map((r) => ({ date: r.TIME_PERIOD!, value: Number(r.OBS_VALUE) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function cpiHistory(content: string, area: string, quarterly: boolean) {
  const indexes = bisObservations(content, area, "628");
  const levels = new Map(indexes.map((r) => [r.date, r.value]));
  return bisObservations(content, area, "771")
    .filter((r) => !quarterly || [3, 6, 9, 12].includes(Number(r.date.slice(5, 7))))
    .map((r) => {
      const d = new Date(`${r.date.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - (quarterly ? 3 : 1));
      const before = levels.get(d.toISOString().slice(0, 7)),
        now = levels.get(r.date);
      return {
        date: quarterly ? quarter(r.date) : r.date,
        yoy: r.value,
        change: before && now ? (now / before - 1) * 100 : null,
      };
    })
    .slice(quarterly ? -8 : -12);
}
export function nzGdp(content: string): Observation[] {
  return csvRecords(content)
    .filter(
      (r) =>
        r.Series_reference === "SNEQ.SG01RSC00B01" &&
        r.Data_value?.trim() &&
        Number.isFinite(Number(r.Data_value)),
    )
    .map((r) => ({ date: quarter(r.Period!.replace(".", "-")), value: Number(r.Data_value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function employmentHistory(observations: Observation[], quarterly: boolean) {
  const levels = new Map(observations.map((r) => [r.date, r.value]));
  const previousDate = (date: string, offset: number) => {
    if (quarterly) {
      const year = Number(date.slice(0, 4)),
        q = Number(date.slice(-1)),
        index = year * 4 + q - 1 - offset;
      return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
    }
    const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - offset);
    return d.toISOString().slice(0, 7);
  };
  return [...observations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const previous = levels.get(previousDate(r.date, 1)),
        yearAgo = levels.get(previousDate(r.date, quarterly ? 4 : 12));
      return {
        date: r.date,
        value: r.value,
        change: previous === undefined ? null : r.value - previous,
        yoy: yearAgo && r.value > 0 ? (r.value / yearAgo - 1) * 100 : null,
      };
    })
    .slice(quarterly ? -8 : -12);
}
export function monthEndHistory(rows: Observation[]) {
  const months = new Map<string, Observation>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date)))
    months.set(r.date.slice(0, 7), r);
  return [...months.values()];
}

export function rbaPolicyObservations(content:string):Observation[] {
  const rows=parseCsv(content.replace(/^\uFEFF/,''));
  const header=rows.findIndex(r=>r[0]==='Series ID');
  const column=rows[header]?.indexOf('FIRMMCRTD') ?? -1;
  if(header<0||column<0)throw Error('RBA cash-rate target series unavailable');
  return rows.slice(header+1).flatMap(r=>{
    const raw=r[column];const time=Date.parse(`${r[0]} UTC`);
    if(!raw?.trim()||!Number.isFinite(Number(raw))||!Number.isFinite(time)||!/^\d/.test(r[0]??''))return [];
    return [{date:new Date(time).toISOString().slice(0,10),value:Number(raw)}];
  }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-180);
}
