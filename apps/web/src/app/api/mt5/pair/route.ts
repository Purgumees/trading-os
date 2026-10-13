import {workspaceToken,deviceToken,syncResponse} from '@/server/mt5-auth';
export const runtime='nodejs';
export async function POST(request:Request){const namespace=workspaceToken(request);if(!namespace)return syncResponse({error:'Invalid private connection key'},401);try{const v=await request.json();if(!/^\d{5,20}$/.test(v.account)||!['swing','intraday'].includes(v.style))return syncResponse({error:'Invalid account'},400);return syncResponse({token:deviceToken(namespace,v.account),account:v.account,expiresInDays:365});}catch{return syncResponse({error:'Pairing unavailable'},503);}}
