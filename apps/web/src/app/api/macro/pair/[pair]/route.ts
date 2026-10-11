import { NextResponse } from "next/server";
import { FOREX_PAIRS, type ForexPair, type Currency } from "@/lib/pair-macro";
import { comparisonSnapshot } from "@/lib/pair-macro-server";
export const maxDuration = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  if (!FOREX_PAIRS.includes(pair as ForexPair))
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  const [base, quote] = await Promise.all([
    comparisonSnapshot(pair.slice(0, 3) as Currency),
    comparisonSnapshot(pair.slice(3) as Currency),
  ]);
  return NextResponse.json({ pair, base, quote });
}
