import {NextResponse} from 'next/server';
import {GET as weekly} from '../weekly/route';
import {download} from '@/lib/international-macro-server';
import {ecbDollarPrices,ecbFxSource} from '@/lib/ecb-fx';
export const maxDuration=60;
export async function GET(){
 const [data,fx]=await Promise.allSettled([
  weekly(new Request('https://trading-os.local/api/macro/weekly')).then(r=>r.json()),
  download('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml').then(r=>r.text()).then(ecbDollarPrices),
 ]);
 if(data.status==='rejected')return NextResponse.json({error:'Weekly theme evidence unavailable'},{status:503});
 return NextResponse.json({weekly:data.value,prices:fx.status==='fulfilled'?fx.value:{},pricesSource:{label:'ECB daily reference rates · same-source cross calculations · not live or execution prices',url:ecbFxSource},errors:fx.status==='rejected'?['ECB daily FX history unavailable; price confirmation withheld']:[]});
}
