export type TreasuryAuction = {
  cusip: string;
  date: string;
  term: string;
  type: string;
  closeTime: string;
  bidToCover: number | null;
  indirectPercent: number | null;
  highYield: number | null;
};
export type TreasuryBuyback = {
  date: string;
  bucket: string;
  operation: string;
  startTime: string;
  endTime: string;
};
export type TreasuryData = {
  updatedAt: string;
  upcoming: TreasuryAuction[];
  latestAuction: TreasuryAuction | null;
  baseline: { count: number; bidToCover: number; indirectPercent: number } | null;
  demand: string;
  nextBuyback: TreasuryBuyback | null;
  errors: string[];
};
type Row = Record<string, unknown>;
const number = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export function auctionRows(input: unknown): TreasuryAuction[] {
  if (!Array.isArray(input)) throw new Error("Invalid Treasury auction response");
  return input
    .filter((row): row is Row =>
      Boolean(
        row &&
        typeof row === "object" &&
        typeof row.auctionDate === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(row.auctionDate),
      ),
    )
    .map((row) => {
      const accepted = number(row.competitiveAccepted);
      const indirect = number(row.indirectBidderAccepted);
      return {
        cusip: String(row.cusip ?? ""),
        date: String(row.auctionDate).slice(0, 10),
        term: String(
          (row.securityType === "Bill"
            ? row.securityTerm
            : row.originalSecurityTerm || row.securityTerm) || "",
        ),
        type:
          row.tips === "Yes"
            ? "TIPS"
            : row.floatingRate === "Yes"
              ? "FRN"
              : String(row.securityType ?? ""),
        closeTime: String(row.closingTimeCompetitive ?? ""),
        bidToCover: number(row.bidToCoverRatio),
        highYield: number(row.highYield),
        indirectPercent:
          accepted !== null &&
          accepted > 0 &&
          indirect !== null &&
          indirect >= 0 &&
          indirect <= accepted
            ? (indirect / accepted) * 100
            : null,
      };
    });
}
export function nextBuyback(xml: string, today: string, time = "00:00"): TreasuryBuyback | null {
  if (!xml.includes("<BuyBackCalendar>")) throw new Error("Invalid Treasury buyback schedule");
  const tag = (block: string, name: string) =>
    (block.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? "")
      .trim()
      .replace(/&amp;/g, "&");
  return (
    Array.from(
      xml.matchAll(/<BuybackCalendarDate>([\s\S]*?)<\/BuybackCalendarDate>/g),
      ([, block = ""]) => ({
        date: tag(block, "OperationDate"),
        bucket: tag(block, "PurchaseBucketName"),
        operation: tag(block, "OperationType"),
        startTime: tag(block, "OperationStartTimeEasternUS"),
        endTime: tag(block, "OperationEndTimeEasternUS"),
      }),
    )
      .filter(
        (row) =>
          /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
          (row.date > today || (row.date === today && row.endTime > time)),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}
export function auctionDemand(rows: TreasuryAuction[], today: string) {
  const results = rows
    .filter(
      (row) =>
        row.date <= today &&
        ["Note", "Bond"].includes(row.type) &&
        row.bidToCover !== null &&
        row.indirectPercent !== null,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestAuction = results[0] ?? null;
  const comparable = latestAuction
    ? results
        .filter(
          (row) =>
            row.date < latestAuction.date &&
            row.term === latestAuction.term &&
            row.type === latestAuction.type,
        )
        .slice(0, 6)
    : [];
  const baseline =
    comparable.length >= 3
      ? {
          count: comparable.length,
          bidToCover: comparable.reduce((sum, row) => sum + row.bidToCover!, 0) / comparable.length,
          indirectPercent:
            comparable.reduce((sum, row) => sum + row.indirectPercent!, 0) / comparable.length,
        }
      : null;
  const demand = !latestAuction
    ? "No recent results"
    : !baseline
      ? "Results available"
      : latestAuction.bidToCover! > baseline.bidToCover &&
          latestAuction.indirectPercent! > baseline.indirectPercent
        ? "Above recent average"
        : latestAuction.bidToCover! < baseline.bidToCover &&
            latestAuction.indirectPercent! < baseline.indirectPercent
          ? "Below recent average"
          : "Mixed vs recent average";
  return { latestAuction, baseline, demand };
}

export function upcomingAuctions(rows: TreasuryAuction[], today: string, time: string) {
  const minutes = (value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    return (+match[1]! % 12) * 60 + +match[2]! + (match[3]!.toUpperCase() === "PM" ? 720 : 0);
  };
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return rows
    .filter(
      (row) =>
        row.date > today ||
        (row.date === today && (minutes(row.closeTime) ?? -1) > hours * 60 + mins),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (minutes(a.closeTime) ?? 0) - (minutes(b.closeTime) ?? 0),
    )
    .slice(0, 6);
}
