import { NextResponse } from "next/server";
import { countries, type Country } from "@/lib/international-macro";
import { countryData } from "@/lib/international-macro-server";
export const maxDuration = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  if (!Object.hasOwn(countries, country))
    return NextResponse.json({ error: "Unknown country" }, { status: 404 });
  return NextResponse.json(await countryData(country as Country));
}
