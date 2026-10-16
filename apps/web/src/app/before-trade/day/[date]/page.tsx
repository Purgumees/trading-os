import {redirect,notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{date:string}>}){
 const {date}=await params;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)notFound();
 redirect(`/before-trade?month=${date.slice(0,7)}&day=${date}&style=intraday`);
}
