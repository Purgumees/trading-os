"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2 } from "lucide-react";

type Setup = { id: string; name: string; timeframe: string; entry: string; confirmation: string; invalidation: string; risk: string; notes: string };
const KEY = "trading-os-setup-library-v1";
const blank = { name: "", timeframe: "", entry: "", confirmation: "", invalidation: "", risk: "", notes: "" };
const examples = ["Asian Range → London", "4H Supply / Demand"];
export default function SetupLibraryPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(saved)) setSetups(saved); } catch {} setReady(true); }, []);
  function persist(next: Setup[]) { setSetups(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { alert("Unable to save setups in this browser."); } }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) persist(setups.map(s => s.id === editing ? { ...form, name: form.name.trim(), id: editing } : s));
    else persist([...setups, { ...form, name: form.name.trim(), id: crypto.randomUUID() }]);
    setOpen(false); setEditing(null); setForm(blank);
  }
  function edit(s: Setup) { setEditing(s.id); setForm({ name:s.name,timeframe:s.timeframe,entry:s.entry,confirmation:s.confirmation,invalidation:s.invalidation,risk:s.risk,notes:s.notes }); setOpen(true); }
  function remove(id: string) { if (window.confirm("Delete this setup?")) persist(setups.filter(s => s.id !== id)); }
  const fields: {key:keyof typeof blank;label:string;multiline?:boolean;placeholder?:string}[] = [
    {key:"name",label:"Setup name",placeholder:"e.g. Asian Range → London"},
    {key:"timeframe",label:"Timeframes",placeholder:"e.g. 4H bias / 5m entry"},
    {key:"entry",label:"Entry conditions",multiline:true},
    {key:"confirmation",label:"Confirmations",multiline:true},
    {key:"invalidation",label:"Invalidation / Stop loss",multiline:true},
    {key:"risk",label:"Targets / Risk management",multiline:true},
    {key:"notes",label:"Notes / TradingView chart links",multiline:true}
  ];
  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><BookOpen className="h-6 w-6"/> Setup Library</h1><p className="mt-1 text-sm text-muted-foreground">Build your trading playbook before tagging trades in Trade Review.</p></div>
      <button onClick={() => {setEditing(null);setForm(blank);setOpen(true);}} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> New Setup</button>
    </div>
    {open && <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{editing ? "Edit Setup" : "Create Setup"}</h2>
      <div className="grid gap-4 md:grid-cols-2">{fields.map(f => <label key={f.key} className={"block space-y-1 text-sm "+(f.multiline?"md:col-span-2":"")}><span className="font-medium">{f.label}</span>{f.multiline ? <textarea rows={3} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full rounded-md border bg-background p-2" placeholder={f.placeholder}/> : <input required={f.key==="name"} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full rounded-md border bg-background p-2" placeholder={f.placeholder}/>}</label>)}</div>
      <div className="flex gap-2"><button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Save Setup</button><button type="button" onClick={()=>setOpen(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button></div>
    </form>}
    {!ready ? <p>Loading setups…</p> : setups.length ? <div className="grid gap-4 md:grid-cols-2">{setups.map(s=><article key={s.id} className="space-y-3 rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{s.name}</h2><p className="text-xs text-muted-foreground">{s.timeframe || "No timeframe specified"}</p></div><div className="flex gap-2"><button aria-label={"Edit "+s.name} onClick={()=>edit(s)} className="rounded-md border p-2"><Pencil className="h-4 w-4"/></button><button aria-label={"Delete "+s.name} onClick={()=>remove(s.id)} className="rounded-md border p-2"><Trash2 className="h-4 w-4"/></button></div></div>{([["Entry",s.entry],["Confirmations",s.confirmation],["Invalidation",s.invalidation],["Risk / Targets",s.risk],["Notes",s.notes]] as const).filter(([,v])=>v).map(([k,v])=><div key={k}><p className="text-xs font-medium text-muted-foreground">{k}</p><p className="whitespace-pre-wrap text-sm">{v}</p></div>)}</article>)}</div> : <section className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">Your setup library is empty</h2><p className="mt-2 text-sm text-muted-foreground">Start with one of your own strategies, such as {examples.join(" or ")}.</p></section>}
    <p className="text-xs text-muted-foreground">Setups are saved in this browser only. Trade tagging and cross-device sync are not connected yet.</p>
  </main>;
}
