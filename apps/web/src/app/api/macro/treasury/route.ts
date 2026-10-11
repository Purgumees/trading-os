import { NextResponse } from "next/server";
import { auctionRows, auctionDemand, nextBuyback, upcomingAuctions } from "@/lib/treasury-data";
export const dynamic = "force-dynamic";
async function read(url: string, json = true): Promise<unknown> {
  const response = await fetch(url, {
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Treasury source unavailable");
  return json ? response.json() : response.text();
}
export async function GET() {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const from = new Date(now.getTime() - 370 * 86400000).toISOString().slice(0, 10);
  const sources = await Promise.allSettled([
    read("https://www.treasurydirect.gov/TA_WS/securities/announced?format=json").then(auctionRows),
    read(
      `https://www.treasurydirect.gov/TA_WS/securities/search?auctionDate=${from},${today}&format=json`,
    ).then(auctionRows),
    read("https://home.treasury.gov/system/files/221/Tentative-Buyback-Schedule.xml", false).then(
      (xml) => nextBuyback(String(xml), today, time),
    ),
  ]);
  const [announced, results, buybacks] = sources;
  const errors = sources.flatMap((source, index) =>
    source.status === "rejected"
      ? [
          [
            "Auction calendar unavailable",
            "Auction results unavailable",
            "Buyback calendar unavailable",
          ][index],
        ]
      : [],
  );
  return NextResponse.json({
    updatedAt: now.toISOString(),
    upcoming:
      announced.status === "fulfilled" ? upcomingAuctions(announced.value, today, time) : [],
    ...auctionDemand(results.status === "fulfilled" ? results.value : [], today),
    nextBuyback: buybacks.status === "fulfilled" ? buybacks.value : null,
    errors,
  });
}
