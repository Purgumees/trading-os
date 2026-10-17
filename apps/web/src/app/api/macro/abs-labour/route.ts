import { NextResponse } from "next/server";

export const revalidate = 3600;
const SOURCE = "https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release";

function plain(html: string) {
  return html.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/\\s+/g, " ").trim();
}
function cells(row: string) {
  return [...row.matchAll(/<t[dh]\\b[^>]*>([\\s\\S]*?)<\\/t[dh]>/gi)].map(m => plain(m[1]));
}
function numeric(s: string) {
  return Number(s.replace(/,/g, "").replace(/%/g, "").replace(/\\s/g, ""));
}
export async function GET() {
  try {
    const response = await fetch(SOURCE, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("ABS source HTTP " + response.status);
    const html = await response.text();
    const text = plain(html);
    const period = text.match(/Reference period\\s+([A-Za-z]+)\\s+(20\\d{2})/i);
    const released = text.match(/Released\\s+(\\d{2}\\/\\d{2}\\/20\\d{2})/i);
    if (!period || !released) throw new Error("ABS release metadata not found");
    const month = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(period[1].toLowerCase()) + 1;
    if (!month) throw new Error("ABS month not recognised");
    const date = period[2] + "-" + String(month).padStart(2,"0");
    const section = html.match(/Key statistics\\s*-\\s*Seasonally adjusted([\\s\\S]*?)Key statistics\\s*-\\s*Trend/i)?.[1] ?? "";
    const rows = [...section.matchAll(/<tr\\b[^>]*>([\\s\\S]*?)<\\/tr>/gi)].map(m => cells(m[1]));
    const employed = rows.find(r => /^Employed people$/i.test(r[0] ?? ""));
    const unemployed = rows.find(r => /^Unemployment rate$/i.test(r[0] ?? ""));
    if (!employed || !unemployed || employed.length < 4 || unemployed.length < 3) throw new Error("ABS seasonally adjusted table unavailable");
    const total = numeric(employed[2]), change = numeric(employed[3]), rate = numeric(unemployed[2]);
    if (!(total > 10000000 && total < 25000000 && Math.abs(change) < 1000000 && rate > 0 && rate < 20)) throw new Error("ABS values failed range checks");
    const [day,mon,year] = released[1].split("/");
    const releaseDate = year + "-" + mon + "-" + day;
    return NextResponse.json({ status:"verified-source-parsed", date, releaseDate, employmentTotal:total, employmentChange:change, unemploymentRate:rate, adjustment:"Seasonally adjusted", source:response.url || SOURCE, checkedAt:new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({status:"unavailable", error:error instanceof Error?error.message:"ABS data unavailable", source:SOURCE, checkedAt:new Date().toISOString()}, {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
