import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/macro/economy-state/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("matches inflation by calendar month, uses monthly consumption, and returns six labour observations", async () => {
  vi.stubEnv("FRED_API_KEY", "test-key");
  const observations = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date(Date.UTC(2026, 8 - offset, 1)).toISOString().slice(0, 10);
    return { date, value: String(150 - offset) };
  }).filter((_, offset) => offset !== 7);
  const series: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.hostname !== "api.stlouisfed.org") return new Response("", { status: 404 });
      series.push(url.searchParams.get("series_id")!);
      return Response.json({ observations });
    }),
  );
  const response = await GET();
  expect(response.status).toBe(200);
  const { economyState: state } = await response.json();
  for (const metric of [
    state.inflation.headline.cpi,
    state.inflation.headline.pce,
    state.inflation.core.coreCpi,
    state.inflation.core.corePce,
  ]) {
    const latest = metric.monthlyHistory.at(-1);
    expect(metric.yoy.current.value).toBe(latest.yoy);
    expect(metric.yoy.current.value).toBe(8.7);
    expect(metric.yoy.current.date).toBe(latest.date);
  }
  expect(series).toContain("PCEC96");
  expect(series).not.toContain("PCECC96");
  for (const key of [
    "unemploymentRate",
    "nonfarmPayrollEmployment",
    "averageHourlyEarnings",
    "joltsJobOpenings",
  ]) {
    expect(state.labour[key].recentHistory).toHaveLength(6);
    expect(state.labour[key].recentHistory.at(-1).date).toBe("2026-09-01");
  }
});
