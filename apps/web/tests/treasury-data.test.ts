import { expect, it, vi, afterEach } from "vitest";
import {
  auctionRows,
  auctionDemand,
  nextBuyback,
  upcomingAuctions,
} from "../src/lib/treasury-data";
import { GET } from "../src/app/api/macro/treasury/route";
afterEach(() => vi.unstubAllGlobals());
const row = (auctionDate: string, overrides = {}) => ({
  cusip: "ABC",
  auctionDate,
  originalSecurityTerm: "30-Year",
  securityType: "Bond",
  tips: "No",
  floatingRate: "No",
  closingTimeCompetitive: "01:00 PM",
  bidToCoverRatio: "2.5",
  competitiveAccepted: "100",
  indirectBidderAccepted: "60",
  ...overrides,
});
it("keeps missing values absent and uses competitive awards as indirect denominator", () => {
  const rows = auctionRows([
    row("2026-10-08", { totalAccepted: "120" }),
    row("2026-09-08", { bidToCoverRatio: "", competitiveAccepted: "0" }),
  ]);
  expect(rows[0].indirectPercent).toBe(60);
  expect(rows[1].bidToCover).toBeNull();
  expect(rows[1].indirectPercent).toBeNull();
});
it("compares the latest nominal coupon with its original maturity, excluding TIPS and FRNs", () => {
  const rows = auctionRows([
    row("2026-10-08", { bidToCoverRatio: "3", indirectBidderAccepted: "80" }),
    ...["2026-09-08", "2026-08-08", "2026-07-08"].map((d) => row(d)),
    row("2026-10-09", { tips: "Yes" }),
    row("2026-10-10", { floatingRate: "Yes" }),
    row("2026-10-13"),
  ]);
  const result = auctionDemand(rows, "2026-10-11");
  expect(result.latestAuction?.date).toBe("2026-10-08");
  expect(result.baseline?.count).toBe(3);
  expect(result.demand).toBe("Above recent average");
});
it("removes auctions after their Eastern close and sorts 11:30 before 13:00", () => {
  const rows = auctionRows([
    row("2026-10-13"),
    row("2026-10-13", { closingTimeCompetitive: "11:30 AM" }),
  ]);
  expect(upcomingAuctions(rows, "2026-10-13", "10:00")[0].closeTime).toBe("11:30 AM");
  expect(upcomingAuctions(rows, "2026-10-13", "12:00")).toHaveLength(1);
  expect(upcomingAuctions(rows, "2026-10-13", "13:00")).toHaveLength(0);
});
it("chooses the next buyback and expires completed same-day operations", () => {
  const block = (d: string) =>
    `<BuybackCalendarDate><OperationDate>${d}</OperationDate><PurchaseBucketName>Nominal Coupons 10Y to 20Y</PurchaseBucketName><OperationEndTimeEasternUS>14:00</OperationEndTimeEasternUS></BuybackCalendarDate>`;
  const xml = `<BuyBackCalendar>${block("2026-10-08")}${block("2026-10-15")}${block("2026-10-20")}</BuyBackCalendar>`;
  expect(nextBuyback(xml, "2026-10-11")?.date).toBe("2026-10-15");
  expect(nextBuyback(xml, "2026-10-15", "14:00")?.date).toBe("2026-10-20");
  expect(nextBuyback(xml, "2027-01-01")).toBeNull();
});
it("returns available results when the independent buyback source fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      input.includes("home.treasury")
        ? new Response("down", { status: 503 })
        : Response.json([row("2026-10-08")]),
    ),
  );
  const response = await GET();
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.latestAuction.cusip).toBe("ABC");
  expect(data.nextBuyback).toBeNull();
  expect(data.errors).toEqual(["Buyback calendar unavailable"]);
});

it("displays the remaining bill term instead of its original issue term", () => {
  expect(
    auctionRows([
      row("2026-10-13", {
        securityType: "Bill",
        securityTerm: "13-Week",
        originalSecurityTerm: "52-Week",
      }),
    ])[0]?.term,
  ).toBe("13-Week");
});
