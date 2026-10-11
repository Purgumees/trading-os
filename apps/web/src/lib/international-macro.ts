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
  },
  aud: {
    name: "Australia",
    flag: "🇦🇺",
    area: "AU",
    bank: "Reserve Bank of Australia",
    gdp: "NGDPRSAXDCAUQ",
    labour: "LRHUTTTTAUM156S",
    quarterlyCpi: true,
    quarterlyLabour: false,
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
  },
} as const;
export type Country = keyof typeof countries;
export type Observation = { date: string; value: number };
export type CountryData = {
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
