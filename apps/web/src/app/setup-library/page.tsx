"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2, ExternalLink, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";

type Rule = { id: string; text: string; required: boolean };
type Example = { id: string; title: string; date: string; symbol: string; outcome: string; chartUrl: string; chart15m?: string; chart5m?: string; image4h?: string; image15m?: string; image5m?: string; rr?: string; sl?: string; timing?: string; notes: string };
type Setup = { id: string; name: string; timeframe: string; entry: string; confirmation: string; invalidation: string; risk: string; notes: string; rules?: Rule[]; examples?: Example[] };
const KEY = "trading-os-setup-library-v1";
const blank = { name: "", timeframe: "", entry: "", confirmation: "", invalidation: "", risk: "", notes: "" };
const uid = () => crypto.randomUUID();
function tradingViewImage(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "s3.tradingview.com" && /\.(png|jpe?g|webp)$/i.test(u.pathname)) return u.toString();
    if (u.hostname === "www.tradingview.com" || u.hostname === "tradingview.com") {
      const match = u.pathname.match(/^\/x\/([a-zA-Z0-9]+)\/?$/);
      const snapshotId = match?.[1];
      if (snapshotId) return "https://s3.tradingview.com/snapshots/" + snapshotId.charAt(0) + "/" + snapshotId + ".png";
    }
  } catch {}
  return null;
}
function ChartPreview({url,label}:{url:string;label:string}) {
  const [failed,setFailed] = useState(false);
  const imageUrl = tradingViewImage(url);
  return <div className="min-w-0 space-y-2 rounded-lg border bg-background p-2">
    <p className="text-xs font-semibold">{label}</p>
    {imageUrl && !failed ? <a href={imageUrl} target="_blank" rel="noopener noreferrer" title={"Enlarge "+label}>
      <img src={imageUrl} alt={label+" TradingView snapshot"} loading="lazy" onError={()=>setFailed(true)} className="aspect-video w-full rounded object-contain bg-black/20"/>
    </a> : <div className="flex aspect-video items-center justify-center rounded border border-dashed p-3 text-center text-xs text-muted-foreground">Preview unavailable. Use a TradingView snapshot link (tradingview.com/x/...).</div>}
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 underline">Open original <ExternalLink className="h-3 w-3"/></a>
  </div>;
}
async function compressScreenshot(file: File): Promise<string> {
  if (!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing unavailable.");
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",0.84);
  } finally { bitmap.close(); }
}
function ScreenshotField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const [busy,setBusy] = useState(false);
  async function handle(file?: File) {
    if (!file) return;
    setBusy(true);
    try { onChange(await compressScreenshot(file)); }
    catch(e) { alert(e instanceof Error ? e.message : "Could not process screenshot"); }
    finally { setBusy(false); }
  }
  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.read) throw new Error("Clipboard access is unavailable. Click the box and press Ctrl+V instead.");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => ["image/png","image/jpeg","image/webp"].includes(t));
        if (type) { await handle(new File([await item.getType(type)],"tradingview-screenshot", {type})); return; }
      }
      alert("Clipboard has no image. Copy the chart as an image in TradingView first.");
    } catch(e) { alert(e instanceof Error ? e.message : "Clipboard permission denied. Click the box and press Ctrl+V."); }
  }
  return <div className="space-y-2 rounded-lg border p-3">
    <p className="text-sm font-medium">{label}</p>
    {value&&<a href={value} target="_blank" rel="noopener noreferrer"><img src={value} alt={label} className="max-h-[650px] w-full rounded bg-black/20 object-contain"/></a>}
    <div tabIndex={0} role="textbox" aria-label={"Paste "+label+" screenshot"} aria-multiline={false}
      onPaste={e=>{const image=Array.from(e.clipboardData.items).find(item=>item.type.startsWith("image/"));if(image){e.preventDefault();void handle(image.getAsFile()||undefined);}}}
      onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void handle(e.dataTransfer.files[0]);}}
      className="flex min-h-24 cursor-text flex-col items-center justify-center gap-2 rounded-md border border-dashed p-3 text-center text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
      <span>{busy?"Processing screenshot…":"Click here and press Ctrl+V to paste TradingView screenshot"}</span>
      <button type="button" disabled={busy} onClick={()=>void pasteFromClipboard()} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted/40">Paste screenshot</button>
    </div>
    {value&&<button type="button" className="text-xs text-muted-foreground underline" onClick={()=>onChange("")}>Remove image</button>}
  </div>;
}
function ScreenshotDisplay({image,label}:{image:string;label:string}) {
  const [zoom,setZoom] = useState(false);
  return <div className="space-y-2 rounded-lg border bg-background p-3">
    <p className="text-sm font-semibold">{label}</p>
    <button type="button" onClick={()=>setZoom(true)} title={"Enlarge "+label} className="block w-full cursor-zoom-in rounded bg-black/20">
      <img src={image} alt={label+" screenshot"} className="max-h-[900px] w-full rounded object-contain"/>
    </button>
    <button type="button" onClick={()=>setZoom(true)} className="text-sm text-blue-500 underline">View larger</button>
    {zoom&&<div role="dialog" aria-modal="true" aria-label={label+" enlarged screenshot"} onClick={()=>setZoom(false)}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 md:p-8">
      <button type="button" onClick={()=>setZoom(false)} className="absolute right-5 top-5 rounded-md border border-white/40 bg-black px-4 py-2 text-white">Close ✕</button>
      <img src={image} alt={label+" enlarged"} onClick={e=>e.stopPropagation()} className="max-h-[92vh] max-w-full object-contain"/>
    </div>}
  </div>;
}
function migrate(s: Setup): Setup {
  let rules = s.rules || (s.confirmation || "").split(/\n/).map(x => x.trim()).filter(Boolean).map(text => ({id:uid(),text,required:true}));
  if (/asian range 50% continuation/i.test(s.name)) {
    // Keep user-authored confirmations, clean duplicates and add the zone rule directly after the first.
    rules = rules.map(r => ({...r, text:r.text.replace(/wintraday/gi,"INTRADAY")}));
    const seenTime = new Set<string>();
    rules = rules.filter(r => {
      if (/entry must occur between 09[:.]00 and 11[:.]30/i.test(r.text)) {
        if (seenTime.has("entry-window")) return false;
        seenTime.add("entry-window");
        return true;
      }
      return true;
    });
    const zone = "PRICE MUST BE INSIDE OR REACTING FROM A 4H / 1H SUPPLY OR DEMAND ZONE";
    if (!rules.some(r => /inside or reacting from a 4h\s*\/\s*1h supply or demand zone/i.test(r.text))) {
      rules.splice(Math.min(1,rules.length),0,{id:uid(),text:zone,required:true});
    }
    const location = "PRICE MUST BE INSIDE THE ASIAN RANGE, IDEALLY NEAR ITS 50% EQUILIBRIUM LEVEL AND A DIRECTION-ALIGNED 1H BULLISH/BEARISH ORDER BLOCK (OB)";
    if (!rules.some(r => /price (must be|is) inside the asian range/i.test(r.text))) rules.push({id:uid(),text:location,required:true});
    if (!rules.some(r => /entry must occur between 09[:.]00 and 11[:.]30/i.test(r.text))) rules.push({id:uid(),text:"ENTRY MUST OCCUR BETWEEN 09:00 AND 11:30 (EEST / FINNISH SUMMER TIME)",required:true});
  }
  const entry = s.entry.replace(/wintraday/gi, "intraday");
  const confirmation = s.confirmation.replace(/wintraday/gi, "intraday");
  return {...s, entry, confirmation, rules, examples: s.examples || []};
}
export default function SetupLibraryPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRule, setNewRule] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingExample, setAddingExample] = useState<string | null>(null);
  const [openedExample, setOpenedExample] = useState<string | null>(null);
  const [openedSetup, setOpenedSetup] = useState<string | null>(null);
  const [example, setExample] = useState({title:"",date:"",symbol:"",outcome:"Win",chartUrl:"",chart15m:"",chart5m:"",image4h:"",image15m:"",image5m:"",rr:"",sl:"",timing:"",notes:""});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(saved)) setSetups(saved.map(migrate)); } catch {} setReady(true); }, []);
  function persist(next: Setup[]) { try { localStorage.setItem(KEY, JSON.stringify(next)); setSetups(next); } catch { alert("Unable to save setups in this browser."); } }
  function startNew() { setEditing(null); setForm(blank); setRules([]); setNewRule(""); setOpen(true); }
  function edit(s: Setup) { setEditing(s.id); setForm({name:s.name,timeframe:s.timeframe,entry:s.entry,confirmation:s.confirmation,invalidation:s.invalidation,risk:s.risk,notes:s.notes}); setRules(s.rules || []); setNewRule(""); setOpen(true); window.scrollTo({top:0,behavior:"smooth"}); }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const finalRules = [...rules, ...(newRule.trim() ? [{id:uid(),text:newRule.trim(),required:true}] : [])];
    if (editing) persist(setups.map(s => s.id === editing ? {...s,...form,name:form.name.trim(),rules:finalRules} : s));
    else persist([...setups, {...form,name:form.name.trim(),id:uid(),rules:finalRules,examples:[]}]);
    setOpen(false);setEditing(null);setForm(blank);setRules([]);setNewRule("");
  }
  function remove(id: string) { if (window.confirm("Delete this setup and its examples?")) persist(setups.filter(s=>s.id!==id)); }
  function addExample(e: React.FormEvent, id: string) {
    e.preventDefault();
    const url=example.chartUrl.trim();
    for (const value of [example.chartUrl,example.chart15m,example.chart5m].filter(Boolean)) { try { const u=new URL(value.trim()); if(u.protocol!=="https:" && u.protocol!=="http:") throw Error(); } catch { alert("Enter valid TradingView chart links beginning with https://"); return; } }
    if (url) { try {const parsed=new URL(url);if(!["https:","http:"].includes(parsed.protocol)) throw Error();}catch{alert("Enter a valid TradingView URL starting with https://");return;} }
    persist(setups.map(s=>s.id===id?{...s,examples:[...(s.examples||[]),{...example,id:uid(),chartUrl:url}]}:s));
    setAddingExample(null);setExample({title:"",date:"",symbol:"",outcome:"Win",chartUrl:"",chart15m:"",chart5m:"",image4h:"",image15m:"",image5m:"",rr:"",sl:"",timing:"",notes:""});
  }
  function removeExample(setupId:string,exampleId:string) {if(!window.confirm("Remove this example?"))return;persist(setups.map(s=>s.id===setupId?{...s,examples:(s.examples||[]).filter(x=>x.id!==exampleId)}:s));}
  const fields: {key:keyof typeof blank;label:string;multiline?:boolean;placeholder?:string}[] = [
    {key:"name",label:"Setup name",placeholder:"e.g. Asian Range → London"},
    {key:"timeframe",label:"Timeframes",placeholder:"e.g. 4H bias / 1H confirmation"},
    {key:"entry",label:"Market bias & setup conditions",multiline:true,placeholder:"Define structure, location and what must happen before looking for an entry."},
    {key:"invalidation",label:"Invalidation / Stop loss",multiline:true},
    {key:"risk",label:"Targets / Risk management",multiline:true},
    {key:"notes",label:"Additional notes",multiline:true}
  ];
  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><BookOpen className="h-6 w-6"/> Setup Library</h1><p className="mt-1 text-sm text-muted-foreground">Define your playbook, check entry confirmations and collect real TradingView examples.</p></div><button onClick={startNew} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> New Setup</button></div>
    {open && <form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-5"><h2 className="font-semibold">{editing?"Edit Setup":"Create Setup"}</h2><div className="grid gap-4 md:grid-cols-2">{fields.map(f=><label key={f.key} className={"block space-y-1 text-sm "+(f.multiline?"md:col-span-2":"")}><span className="font-medium">{f.label}</span>{f.multiline?<textarea rows={3} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full rounded-md border bg-background p-2" placeholder={f.placeholder}/>:<input required={f.key==="name"} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full rounded-md border bg-background p-2" placeholder={f.placeholder}/>}</label>)}</div>
    <section className="space-y-3 rounded-lg border p-4"><div><h3 className="font-semibold">Entry confirmations checklist</h3><p className="text-xs text-muted-foreground">Add each confirmation separately. Mark essential conditions as Required; others as Optional.</p></div>{rules.map(r=><div key={r.id} className="flex flex-wrap items-center gap-2"><input aria-label="Confirmation" className="min-w-[170px] flex-1 rounded-md border bg-background p-2 text-sm" value={r.text} onChange={e=>setRules(rules.map(x=>x.id===r.id?{...x,text:e.target.value}:x))}/><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={r.required} onChange={e=>setRules(rules.map(x=>x.id===r.id?{...x,required:e.target.checked}:x))}/> Required</label><button type="button" aria-label="Remove confirmation" onClick={()=>setRules(rules.filter(x=>x.id!==r.id))} className="rounded border p-2"><Trash2 className="h-4 w-4"/></button></div>)}<div className="flex gap-2"><input className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm" placeholder="e.g. 1H bullish structure breaks before bearish continuation" value={newRule} onChange={e=>setNewRule(e.target.value)}/><button type="button" onClick={()=>{if(newRule.trim()){setRules([...rules,{id:uid(),text:newRule.trim(),required:true}]);setNewRule("");}}} className="rounded-md border px-3 text-sm">Add rule</button></div></section>
    <div className="flex gap-2"><button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Save Setup</button><button type="button" onClick={()=>setOpen(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button></div></form>}
    {!ready?<p>Loading setups…</p>:setups.length?<div className="space-y-4">{setups.map(s=>{const required=(s.rules||[]).filter(r=>r.required);const passed=required.filter(r=>checked[s.id+":"+r.id]).length;return <div key={s.id}>
  <div className="rounded-xl border bg-card p-4">
    <button type="button" onClick={()=>setOpenedSetup(s.id)} className="flex w-full items-center justify-between gap-3 text-left">
      <div className="min-w-0"><h2 className="truncate font-semibold">{s.name}</h2><p className="text-xs text-muted-foreground">{s.timeframe||"No timeframe specified"} · {(s.examples||[]).length} trade examples</p></div>
      <span className="shrink-0 rounded-md border px-3 py-2 text-xs">Open setup ↗</span>
    </button>
  </div>
  {openedSetup===s.id&&<div role="dialog" aria-modal="true" aria-label={s.name} onClick={()=>{setOpenedSetup(null);setOpenedExample(null);}} className="fixed inset-0 z-[80] bg-black/85 p-2 md:p-6">
    <div onClick={e=>e.stopPropagation()} className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b p-3 md:px-6"><div className="min-w-0"><h2 className="truncate font-semibold">{s.name}</h2><p className="text-xs text-muted-foreground">{s.timeframe||"Trading setup"}</p></div><button type="button" onClick={()=>{setOpenedSetup(null);setOpenedExample(null);}} className="shrink-0 rounded-md border px-4 py-2 text-sm">Close ✕</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
        <article className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{s.name}</h2><p className="text-sm text-muted-foreground">{s.timeframe||"No timeframe specified"}</p></div><div className="flex gap-2"><button aria-label={"Edit "+s.name} onClick={()=>edit(s)} className="rounded-md border p-2"><Pencil className="h-4 w-4"/></button><button aria-label={"Delete "+s.name} onClick={()=>remove(s.id)} className="rounded-md border p-2"><Trash2 className="h-4 w-4"/></button></div></div>
    {([["Market bias & conditions",s.entry],["Invalidation",s.invalidation],["Risk / Targets",s.risk],["Notes",s.notes]] as const).filter(([,v])=>v).map(([k,v])=><div key={k}><p className="mb-1 text-xs font-medium text-muted-foreground">{k}</p><p className="whitespace-pre-wrap text-sm uppercase">{v}</p></div>)}
    <section className="space-y-2 rounded-lg border p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Entry confirmations</h3><span className="text-xs text-muted-foreground">Required: {passed}/{required.length}</span></div>{(s.rules||[]).length?(s.rules||[]).map(r=><label key={r.id} className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!checked[s.id+":"+r.id]} onChange={e=>setChecked({...checked,[s.id+":"+r.id]:e.target.checked})}/><span className="flex-1 uppercase">{r.text}</span><span className="text-xs text-muted-foreground">{r.required?"Required":"Optional"}</span></label>):<p className="text-sm text-muted-foreground">No checklist yet. Edit the setup to add required confirmations.</p>}{required.length>0&&<p className="text-xs font-medium">{passed===required.length?<span className="text-emerald-500">All required confirmations checked</span>:"Required confirmations not complete"}</p>}<p className="text-xs text-muted-foreground">Checklist is a temporary planning aid, not a saved trade record.</p></section>
    <section className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><button onClick={()=>setExpanded(expanded===s.id?null:s.id)} className="flex items-center gap-2 font-semibold">Real Trade Examples ({(s.examples||[]).length}) {expanded===s.id?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button><button onClick={()=>{setExpanded(s.id);setAddingExample(s.id);setExample({title:"",date:"",symbol:"",outcome:"Win",chartUrl:"",chart15m:"",chart5m:"",image4h:"",image15m:"",image5m:"",rr:"",sl:"",timing:"",notes:""});}} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs"><Plus className="h-4 w-4"/> Add Example</button></div>{expanded===s.id&&<div className="space-y-3">{(s.examples||[]).length===0&&<p className="text-sm text-muted-foreground">Copy a TradingView screenshot as an image, then paste it into the matching timeframe box (Ctrl+V).</p>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(s.examples||[]).map(ex=>{
  const selected = openedExample===s.id+":"+ex.id;
  const preview = ex.image4h || ex.image15m || ex.image5m || tradingViewImage(ex.chartUrl||ex.chart15m||ex.chart5m||"");
  return <div key={ex.id} className="min-w-0 overflow-hidden rounded-lg border bg-background">
    <button type="button" onClick={()=>setOpenedExample(selected?null:s.id+":"+ex.id)} aria-expanded={selected} className="block w-full text-left hover:bg-muted/30">
      {preview?<img src={preview} alt={ex.symbol+" trade preview"} loading="lazy" className="h-36 w-full bg-black/20 object-cover object-center"/>:<div className="flex h-36 items-center justify-center bg-muted/20 text-sm text-muted-foreground">No chart preview</div>}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{ex.date||"No date"}</span><span className="rounded border px-2 py-0.5 text-xs">{ex.outcome}</span></div>
        <p className="text-xs text-muted-foreground">{ex.symbol}</p>
        <p className="line-clamp-2 text-sm font-medium">{ex.title||"Trade example"}</p>
        <p className="text-xs text-blue-500">{selected?"Close details ▲":"Open full example ▼"}</p>
      </div>
    </button>
  </div>;
})}</div>
{(s.examples||[]).filter(ex=>openedExample===s.id+":"+ex.id).map(ex=><div key={ex.id} role="dialog" aria-modal="true" aria-label={ex.title||"Trade details"} onClick={()=>setOpenedExample(null)} className="fixed inset-0 z-[90] bg-black/85 p-2 md:p-6">
  <div onClick={e=>e.stopPropagation()} className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background p-4 md:px-6">
      <div className="min-w-0"><h3 className="truncate text-lg font-semibold">{ex.title||ex.symbol||"Trade example"}</h3><p className="text-sm text-muted-foreground">{[ex.date,ex.symbol,ex.outcome].filter(Boolean).join(" · ")}</p></div>
      <div className="flex gap-2"><button type="button" onClick={()=>setOpenedExample(null)} className="rounded-md border px-4 py-2 text-sm font-medium">Close ✕</button><button type="button" aria-label="Delete example" onClick={()=>{removeExample(s.id,ex.id);setOpenedExample(null);}} className="rounded-md border p-2"><Trash2 className="h-4 w-4"/></button></div>
    </div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
      {(ex.rr||ex.sl||ex.timing)&&<p className="text-sm">{[ex.rr&&"RR: "+ex.rr,ex.sl&&"SL: "+ex.sl,ex.timing&&"Entry time: "+ex.timing].filter(Boolean).join(" · ")}</p>}
      {ex.notes&&<p className="whitespace-pre-wrap text-sm">{ex.notes}</p>}
      <div className="flex flex-col gap-6">
        {ex.image4h?<ScreenshotDisplay image={ex.image4h} label="1H / 4H"/>:ex.chartUrl&&<ChartPreview url={ex.chartUrl} label="1H / 4H"/>}
        {ex.image15m?<ScreenshotDisplay image={ex.image15m} label="15M"/>:ex.chart15m&&<ChartPreview url={ex.chart15m} label="15M"/>}
        {ex.image5m?<ScreenshotDisplay image={ex.image5m} label="5M / 1M"/>:ex.chart5m&&<ChartPreview url={ex.chart5m} label="5M / 1M"/>}
      </div>
    </div>
  </div>
</div>)}{addingExample===s.id&&<form onSubmit={e=>addExample(e,s.id)} className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">{([["title","Example title"],["date","Trade date"],["symbol","Symbol"],["rr","RR (e.g. 1:3)"],["sl","SL (price / pips)"],["timing","Entry time (HH:MM + timezone)"]] as const).map(([key,label])=><label key={key} className="space-y-1 text-xs"><span>{label}</span><input type={key==="date"?"date":"text"} required={key==="title"} value={example[key]} onChange={e=>setExample({...example,[key]:e.target.value})} className="w-full rounded-md border bg-background p-2 text-sm" placeholder={key.startsWith("chart")?"https://www.tradingview.com/x/...":key==="timing"?"09:45 Europe/Helsinki":""}/></label>)}<div className="grid gap-4 md:col-span-2 lg:grid-cols-1">
  <ScreenshotField label="1H / 4H screenshot" value={example.image4h} onChange={v=>setExample(x=>({...x,image4h:v}))}/>
  <ScreenshotField label="15M screenshot" value={example.image15m} onChange={v=>setExample(x=>({...x,image15m:v}))}/>
  <ScreenshotField label="5M / 1M screenshot" value={example.image5m} onChange={v=>setExample(x=>({...x,image5m:v}))}/>
</div><label className="space-y-1 text-xs"><span>Outcome</span><select value={example.outcome} onChange={e=>setExample({...example,outcome:e.target.value})} className="w-full rounded-md border bg-background p-2 text-sm"><option>Win</option><option>Loss</option><option>Breakeven</option><option>Missed</option></select></label><label className="space-y-1 text-xs md:col-span-2"><span>What happened / lessons</span><textarea rows={3} value={example.notes} onChange={e=>setExample({...example,notes:e.target.value})} className="w-full rounded-md border bg-background p-2 text-sm"/></label><div className="flex gap-2 md:col-span-2"><button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Save Example</button><button type="button" onClick={()=>setAddingExample(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button></div></form>}</div>}</section></article></div></div></div>}</div>})}</div>:<section className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">Your setup library is empty</h2><p className="mt-2 text-sm text-muted-foreground">Create your first trading setup and define its entry confirmations.</p></section>}
    <p className="text-xs text-muted-foreground">Pasted screenshots are compressed and saved in this browser only; browser storage has limited space. Back up important screenshots elsewhere. Cross-device sync is not connected yet.</p>
  </main>;
}
