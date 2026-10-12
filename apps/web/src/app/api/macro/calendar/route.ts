import {NextResponse} from 'next/server';
import {download} from '@/lib/international-macro-server';
import {parseWeeklyEvents} from '@/lib/weekly-calendar';
export async function GET(){
 const asOf=new Date().toISOString(),source='https://www.forexfactory.com/calendar';
 try{
  const response=await download('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
  const events=parseWeeklyEvents(await response.json(),asOf);
  return NextResponse.json({asOf,events,source,error:null});
 }catch{return NextResponse.json({asOf,events:[],source,error:'Could not load the calendar. Try again.'},{status:502});}
}
