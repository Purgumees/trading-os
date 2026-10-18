import {
  countries,
  bisObservations,
  quarter,
  type Country,
  type CountryData,
} from "./international-macro";
import { countryData, download, fred } from "./international-macro-server";
import { fetchEurostatGrowthSeries } from "./eurostat-growth";
import { fetchEurostatHicpSeries } from "./eurostat-hicp";
import { fetchEurostatLabourSeries } from "./eurostat-labour";
import { indexInflation, type ComparisonSnapshot, type Currency } from "./pair-macro";
export async function comparisonSnapshot(currency: Currency): Promise<ComparisonSnapshot> {
  if (currency !== "EUR" && currency !== "USD") {
    const key = currency.toLowerCase() as Country,
      c = countries[key],
      data = await countryData(key);
    return {
      ...data,
      currency,
      name: c.name,
      policyLabel: c.bank + " policy rate",
      inflationLabel: "Headline CPI · YoY · not seasonally adjusted",
      labourLabel: "OECD harmonized unemployment · seasonally adjusted",
      quarterlyCpi: c.quarterlyCpi,
      quarterlyLabour: c.quarterlyLabour,
      sources: {
        policy: currency === "AUD" ? "https://www.rba.gov.au/statistics/tables/" : "https://data.bis.org/topics/CBPOL",
        inflation: "https://data.bis.org/topics/CPI",
        labour: `https://fred.stlouisfed.org/series/${c.labour}`,
      },
    };
  }
  const us = currency === "USD",
    asOf = new Date().toISOString().slice(0, 10);
  const results = await Promise.allSettled([
    us
      ? fred("DFEDTARU").then((rows) => rows.slice(-90))
      : download(
          "https://stats.bis.org/api/v1/data/WS_CBPOL/D.XM?startPeriod=2025-01-01&format=csv",
        )
          .then((r) => r.text())
          .then((s) => bisObservations(s, "XM", "368").slice(-180)),
    us
      ? fred("GDPC1").then((rows) => rows.map((r) => ({ ...r, date: quarter(r.date) })))
      : fetchEurostatGrowthSeries("B1GQ", asOf).then((s) =>
          s.observations.map(({ date, value }) => ({ date, value })),
        ),
    us
      ? Promise.all([fred("CPIAUCNS"), fred("CPIAUCSL")]).then(([unadjusted,adjusted]) => {
          // BLS official 12-month headline CPI is not seasonally adjusted.
          // Its monthly change is seasonally adjusted; do not calculate both from CPIAUCSL.
          const adjustedChanges = new Map(indexInflation(adjusted).map(r => [r.date, r.change]));
          return {
            rows: indexInflation(unadjusted).map(r => ({ ...r, change: adjustedChanges.get(r.date) ?? null })),
            estimated: [] as string[],
          };
        })
      : fetchEurostatHicpSeries("TOTAL").then((s) => ({
          rows: indexInflation(s.observations.map((r) => ({ date: r.date, value: r.index }))),
          estimated: s.observations.filter((r) => r.flag?.includes("e")).map((r) => r.date),
        })),
    us
      ? fred("UNRATE").then((rows) =>
          rows.slice(-12).map((r) => ({ ...r, date: r.date.slice(0, 7) })),
        )
      : fetchEurostatLabourSeries("UNR", asOf).then((s) =>
          s.observations.slice(-12).map(({ date, value }) => ({ date, value })),
        ),
  ]);
  const [policy, gdp, inflation, labour] = results;
  const data: CountryData = {
    policy: policy.status === "fulfilled" ? policy.value : [],
    gdp: gdp.status === "fulfilled" ? gdp.value : [],
    inflation: inflation.status === "fulfilled" ? inflation.value.rows : [],
    labour: labour.status === "fulfilled" ? labour.value : [],
    errors: results.flatMap((r, i) =>
      r.status === "rejected"
        ? [["Policy rate", "GDP", "Inflation", "Jobs"][i] + " unavailable"]
        : [],
    ),
    fetchedAt: new Date().toISOString(),
    gdpSource: us
      ? "https://fred.stlouisfed.org/series/GDPC1"
      : "https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table",
  };
  return {
    ...data,
    estimatedInflationPeriods: inflation.status === "fulfilled" ? inflation.value.estimated : [],
    currency,
    name: us ? "United States" : "Euro area",
    policyLabel: us ? "Fed target range · upper bound" : "ECB deposit facility rate",
    inflationLabel: us
      ? "Headline CPI · YoY not seasonally adjusted; MoM seasonally adjusted"
      : "Headline HICP · YoY · not seasonally adjusted",
    labourLabel: us
      ? "US unemployment · seasonally adjusted"
      : "Eurostat unemployment · seasonally adjusted",
    quarterlyCpi: false,
    quarterlyLabour: false,
    sources: {
      policy: us
        ? "https://fred.stlouisfed.org/series/DFEDTARU"
        : "https://data.bis.org/topics/CBPOL",
      inflation: us
        ? "https://fred.stlouisfed.org/series/CPIAUCNS"
        : "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table",
      labour: us
        ? "https://fred.stlouisfed.org/series/UNRATE"
        : "https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table",
    },
  };
}
