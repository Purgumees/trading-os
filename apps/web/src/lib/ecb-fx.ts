import type {Currency} from './pair-macro';
import type {Observation} from './international-macro';
export const ecbFxSource='https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
export function ecbDollarPrices(xml:string):Partial<Record<Currency,Observation[]>>{
 const prices:Partial<Record<Currency,Observation[]>>={};
 for(const block of xml.matchAll(/<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g)){
  const rates=new Map([...block[2]!.matchAll(/<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']\s*\/>/g)].map(m=>[m[1]!,Number(m[2])]));
  const usd=rates.get('USD');if(!usd||!Number.isFinite(usd)||usd<=0)continue;
  for(const currency of ['EUR','USD','GBP','JPY','CAD','AUD','NZD'] as Currency[]){const perEuro=currency==='EUR'?1:rates.get(currency);if(!perEuro||!Number.isFinite(perEuro)||perEuro<=0)continue;(prices[currency]??=[]).push({date:block[1]!,value:usd/perEuro});}
 }
 if(!prices.EUR?.length)throw Error('ECB FX history unavailable');
 for(const rows of Object.values(prices))rows?.sort((a,b)=>a.date.localeCompare(b.date));
 return prices;
}
