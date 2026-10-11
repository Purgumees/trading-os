import { NextResponse } from "next/server";
import {countries,type Country} from "@/lib/international-macro";
import {internationalYields} from "@/lib/international-yields-server";
export const maxDuration=60;
export async function GET(_r:Request,{params}:{params:Promise<{country:string}>}){const {country}=await params;if(!Object.hasOwn(countries,country))return NextResponse.json({error:"Unknown country"},{status:404});return NextResponse.json(await internationalYields(country as Country));}
