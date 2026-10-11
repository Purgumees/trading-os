import {it,expect,vi} from 'vitest';
import {internationalYields} from '../src/lib/international-yields-server';
it('labels a verified dated snapshot when the official NZ server rejects refresh',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('',{status:403}));
 try{const data=await internationalYields('nzd');expect(data.rows.at(-1)).toEqual({date:'2026-10-08',two:3.85,ten:5.11,thirty:null});expect(data.definition).toContain('snapshot');expect(data.note).toContain('Automatic refresh unavailable');expect(data.note).toContain('not a live feed');}finally{vi.unstubAllGlobals();}
});
