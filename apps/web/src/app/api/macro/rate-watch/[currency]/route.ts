import { NextResponse } from "next/server";
import { watchBanks, parseBankWatch, type WatchCurrency } from "@/lib/central-bank-watch";
import { download } from "@/lib/international-macro-server";
export const maxDuration=60;
export async function GET(_request:Request,{params}:{params:Promise<{currency:string}>}) {
 const {currency}=await params;
 if(!Object.hasOwn(watchBanks,currency))return NextResponse.json({error:"Unknown currency"},{status:400});
 const c=currency as WatchCurrency;const source=`https://centralbank.watch/${watchBanks[c].path}/`;
 try {return NextResponse.json(parseBankWatch(c==='CAD'?'':await(await download(source)).text(),c));}
 catch{return NextResponse.json({...parseBankWatch('',c),status:"Market expectations source could not load"});}
}
