"use client";
import { useEffect, useState } from "react";
import type { TreasuryData } from "@/lib/treasury-data";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
export function TreasuryPanel() {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/macro/treasury", { signal: controller.signal });
        if (!response.ok) throw new Error("Treasury unavailable");
        setData(await response.json());
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 15 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);
  const auction = data?.upcoming[0];
  const buyback = data?.nextBuyback;
  const result = data?.latestAuction;
  const waiting = error ? "Temporarily unavailable" : "Loading…";
  return (
    <section className="mb-8" aria-label="Treasury auctions and buybacks" aria-live="polite">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h3 className="text-sm text-muted-foreground">Next Treasury Auction</h3>
          <p className="mt-2 text-xl font-semibold">
            {auction
              ? date(auction.date)
              : data
                ? data.errors.includes("Auction calendar unavailable")
                  ? "Temporarily unavailable"
                  : "No upcoming auction announced"
                : waiting}
          </p>
          {auction && (
            <p className="mt-2 text-sm">
              {auction.term} {auction.type} · {auction.closeTime} ET · CUSIP {auction.cusip}
            </p>
          )}
          {data && data.upcoming.length > 1 && (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {data.upcoming.slice(1).map((item) => (
                <li key={`${item.cusip}-${item.date}`}>
                  {date(item.date)} · {item.term} {item.type} · {item.closeTime} ET
                </li>
              ))}
            </ul>
          )}
          <a
            className="mt-3 inline-block text-xs underline"
            href="https://www.treasurydirect.gov/auctions/upcoming/"
            target="_blank"
            rel="noreferrer"
          >
            TreasuryDirect · announced auctions
          </a>
        </div>
        <div className="rounded-xl border p-5">
          <h3 className="text-sm text-muted-foreground">Next Treasury Buyback</h3>
          <p className="mt-2 text-xl font-semibold">
            {buyback
              ? date(buyback.date)
              : data
                ? data.errors.includes("Buyback calendar unavailable")
                  ? "Temporarily unavailable"
                  : "No future operation in published schedule"
                : waiting}
          </p>
          {buyback && (
            <>
              <p className="mt-2 text-sm">
                {buyback.bucket} · {buyback.startTime}–{buyback.endTime} ET
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {buyback.operation} · tentative schedule
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Dates from Treasury XML calendar. Check the latest PDF for revised purchase amounts.
          </p>
          <a
            className="mt-2 inline-block text-xs underline"
            href="https://home.treasury.gov/system/files/221/Tentative-Buyback-Schedule.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Treasury · latest buyback schedule
          </a>
        </div>
      </div>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Treasury Demand Signal</h2>
      <div className="rounded-xl border p-5">
        <p className="mb-4 text-sm text-muted-foreground">
          {result
            ? `Latest nominal coupon auction: ${result.term} ${result.type} · ${date(result.date)} · ${result.cusip}`
            : data
              ? "No recent nominal coupon results available"
              : waiting}
        </p>
        <div className="grid gap-6 md:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Bid-to-Cover</p>
            <p className="mt-2 text-xl font-semibold">{result?.bidToCover?.toFixed(2) ?? "—"}</p>
            {data?.baseline && (
              <p className="mt-1 text-xs text-muted-foreground">
                Recent average {data.baseline.bidToCover.toFixed(2)}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tail / Stop-Through</p>
            <p className="mt-2 text-xl font-semibold">Unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Requires a when-issued yield at auction close.
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Indirect Bidders</p>
            <p className="mt-2 text-xl font-semibold">
              {result?.indirectPercent != null ? `${result.indirectPercent.toFixed(1)}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Share of competitive awards
              {data?.baseline
                ? ` · recent average ${data.baseline.indirectPercent.toFixed(1)}%`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Demand</p>
            <p className="mt-2 text-xl font-semibold">{data?.demand ?? waiting}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.baseline
                ? `Compared with ${data.baseline.count} prior auctions of the same original term. Both metrics must agree.`
                : "At least 3 comparable prior auctions required for comparison."}
            </p>
          </div>
        </div>
        {result?.highYield != null && (
          <p className="mt-4 text-sm text-muted-foreground">
            Auction high yield: {result.highYield.toFixed(3)}%
          </p>
        )}
        <a
          className="mt-3 inline-block text-xs underline"
          href="https://www.treasurydirect.gov/auctions/auction-query/"
          target="_blank"
          rel="noreferrer"
        >
          TreasuryDirect · auction results
        </a>
        {data?.errors.map((message) => (
          <p key={message} className="mt-2 text-sm text-amber-600">
            {message}
          </p>
        ))}
        {error && data && (
          <p className="mt-2 text-sm text-amber-600">
            Refresh failed; showing the previous response.
          </p>
        )}
        {data && (
          <p className="mt-2 text-xs text-muted-foreground">
            Fetched{" "}
            {new Date(data.updatedAt).toLocaleString("en-GB", { timeZone: "Europe/Tallinn" })} ·
            Tallinn time · refreshes every 15 minutes
          </p>
        )}
      </div>
    </section>
  );
}
