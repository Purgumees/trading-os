import {BeforeTrade} from '@/components/BeforeTrade';
import {notFound} from 'next/navigation';
export default async function Page({params,searchParams}:{params:Promise<{date:string}>;searchParams:Promise<{style?:string}>}){
 const {date}=await params;
 const {style}=await searchParams;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)notFound();
 return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><BeforeTrade detailDay={date}/></main>;
}
