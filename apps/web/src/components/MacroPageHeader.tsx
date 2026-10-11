export function MacroPageHeader({ title, description }: { title: string; description?: string }) {
  return <header className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
    <h1 className="text-3xl font-bold">{title}</h1>
    <p className="mt-2 text-muted-foreground">{description ?? "Growth, inflation, labour and monetary policy · ◆ marks the latest published observation."}</p>
  </header>;
}
