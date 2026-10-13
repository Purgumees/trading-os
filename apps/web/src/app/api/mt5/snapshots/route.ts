import {get} from '@vercel/blob';
import {workspaceToken,syncResponse} from '@/server/mt5-auth';
export const runtime='nodejs';
export async function POST(request:Request){const namespace=workspaceToken(request);if(!namespace)return syncResponse({error:'Invalid private connection key'},401);try{const {account}=await request.json();if(!/^\d{5,20}$/.test(account))return syncResponse({error:'Invalid account'},400);const r=await get(`mt5/${namespace}/${account}/latest.json`,{access:'private',useCache:false});if(!r||r.statusCode!==200)return syncResponse({snapshot:null});return syncResponse({snapshot:JSON.parse(await new Response(r.stream).text())});}catch{return syncResponse({error:'Private snapshot unavailable'},503);}}
