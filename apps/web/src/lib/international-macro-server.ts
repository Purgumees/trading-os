import {
  bisObservations,
  rbaPolicyObservations,
  cpiHistory,
  countries,
  nzGdp,
  quarter,
  type Country,
  type CountryData,
  type Observation,
} from "./international-macro";
export async function download(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Source unavailable (${response.status})`);
  return response;
}
export async function fred(series: string): Promise<Observation[]> {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) throw new Error("FRED is not configured");
  const params = new URLSearchParams({
    series_id: series,
    api_key: key,
    file_type: "json",
    sort_order: "desc",
    limit: "100",
  });
  const data = await (
    await download(`https://api.stlouisfed.org/fred/series/observations?${params}`)
  ).json();
  return (data.observations ?? [])
    .filter(
      (r: { value: string }) =>
        r.value?.trim() && r.value !== "." && Number.isFinite(Number(r.value)),
    )
    .map((r: { date: string; value: string }) => ({ date: r.date, value: Number(r.value) }))
    .sort((a: Observation, b: Observation) => a.date.localeCompare(b.date));
}
async function newZealandGdp() {
  const page = await (
    await download("https://www.stats.govt.nz/indicators/gross-domestic-product-gdp/")
  ).text();
  const normalizedPage = page.replaceAll("&quot;", '"').replaceAll("\\/", "/");
  const links = [
    ...normalizedPage.matchAll(
      /(?:https:\/\/www\.stats\.govt\.nz)?\/information-releases\/gross-domestic-product-[a-z]+-20\d{2}-quarter\//g,
    ),
  ].map((x) => x[0]);
  if (!links[0]) throw new Error("Latest Stats NZ release unavailable");
  const release = new URL(links[0], "https://www.stats.govt.nz").href;
  const html = (await (await download(release)).text())
    .replaceAll("&quot;", '"')
    .replaceAll("\\/", "/");
  const match = html.match(
    /\/assets\/Uploads\/Gross-domestic-product\/[^"<>]+\/gross-domestic-product-[a-z]+-20\d{2}-quarter\.csv/,
  );
  if (!match) throw new Error("Stats NZ GDP download unavailable");
  const rows = nzGdp(
    await (await download(new URL(match[0], "https://www.stats.govt.nz").href)).text(),
  );
  if (!rows.length) throw new Error("Stats NZ GDP series unavailable");
  return { rows, source: release };
}
// BoC V39079 is the official business-daily overnight target, not a BIS proxy.
function bocPolicyObservations(data:unknown):Observation[] {
  const observations=(data as {observations?:Array<{d?:string;V39079?:{v?:string}}>} | null)?.observations;
  if(!Array.isArray(observations))throw new Error("Bank of Canada policy observations unavailable");
  const rows=observations.flatMap(r=>{
    const date=r.d,raw=r.V39079?.v;
    if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof raw!=="string"||!raw.trim()||!Number.isFinite(Number(raw)))return [];
    return [{date,value:Number(raw)}];
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length)throw new Error("Bank of Canada policy rate has no valid observations");
  return rows.slice(-180);
}

export async function countryData(country: Country): Promise<CountryData> {
  const c = countries[country];
  const results = await Promise.allSettled([
    country === "aud" ? download("https://www.rba.gov.au/statistics/tables/csv/f1-data.csv").then(r=>r.text()).then(rbaPolicyObservations) :
    country === "cad" ? download("https://www.bankofcanada.ca/valet/observations/V39079/json?recent=180").then(r=>r.json()).then(bocPolicyObservations) :
    download(
      `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${c.area}?startPeriod=2025-01-01&format=csv`,
    )
      .then((r) => r.text())
      .then((s) => bisObservations(s, c.area, "368").slice(-180)),
    download(
      `https://stats.bis.org/api/v1/data/WS_LONG_CPI/M.${c.area}?startPeriod=2023-01&format=csv`,
    )
      .then((r) => r.text())
      .then((s) => cpiHistory(s, c.area, c.quarterlyCpi)),
    country === "nzd"
      ? newZealandGdp()
      : fred(c.gdp).then((rows) => ({
          rows: rows.map((r) => ({ ...r, date: quarter(r.date) })),
          source: `https://fred.stlouisfed.org/series/${c.gdp}`,
        })),
    fred(c.labour).then((rows) =>
      rows
        .slice(c.quarterlyLabour ? -8 : -12)
        .map((r) => ({ ...r, date: c.quarterlyLabour ? quarter(r.date) : r.date.slice(0, 7) })),
    ),
    fred(c.employment).then((rows) =>
      rows.map((r) => ({
        ...r,
        date: c.quarterlyEmployment ? quarter(r.date) : r.date.slice(0, 7),
      })),
    ),
  ]);
  const [policy, inflation, gdp, labour, employment] = results;
  // Fail closed when daily policy observations lag the announced central-bank decision.
  const policyRows = policy.status === "fulfilled" ? policy.value : [];
  const latestPolicy = policyRows.at(-1);
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = latestPolicy ? Math.floor((Date.parse(today + "T00:00:00Z") - Date.parse(latestPolicy.date + "T00:00:00Z")) / 86400000) : Infinity;
  const cadDecisionNotReflected = country === "cad" && today >= "2026-10-29" && latestPolicy !== undefined && latestPolicy.date < "2026-10-29" && latestPolicy.value !== 2.5;
  const stalePolicy = !latestPolicy || ageDays < 0 || ageDays > (country === "cad" ? 1 : 45) || cadDecisionNotReflected;
  const policyWarnings = stalePolicy ? [cadDecisionNotReflected
    ? "CRITICAL: STALE DATA — DO NOT USE FOR TRADING. BoC announced 2.50% effective 2026-10-29, but the daily API reports an older rate. Verify at bankofcanada.ca."
    : "STALE DATA — DO NOT USE FOR TRADING. Policy rate not verified against the latest central-bank decision."] : [];

  return {
    employment: employment.status === "fulfilled" ? employment.value : [],
    policy: stalePolicy ? [] : policyRows,
    inflation: inflation.status === "fulfilled" ? inflation.value : [],
    gdp: gdp.status === "fulfilled" ? gdp.value.rows : [],
    labour: labour.status === "fulfilled" ? labour.value : [],
    gdpSource: gdp.status === "fulfilled" ? gdp.value.source : "",
    errors: [...policyWarnings, ...results.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            ["Policy rate", "Inflation", "GDP", "Unemployment", "Employment"][i] +
              " data currently unavailable",
          ]
        : [],
    )],
    fetchedAt: new Date().toISOString(),
  };
}
