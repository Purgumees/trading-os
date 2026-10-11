import Link from "next/link";
import { countries } from "@/lib/international-macro";
export function MacroRegionNav({ region }: { region: string }) {
  const items = [
    ["euro", "🇪🇺 EURO AREA"],
    ["dxy", "🇺🇸 USA / DXY"],
    ...Object.entries(countries).map(([key, c]) => [key, `${c.flag} ${key.toUpperCase()}`]),
  ];
  return (
    <nav className="mb-6 flex flex-wrap gap-3" aria-label="Macro regions">
      {items.map(([key, label]) => (
        <Link
          key={key}
          href={`/${key}`}
          aria-current={region === key ? "page" : undefined}
          className={`rounded-lg border px-5 py-3 font-semibold ${region === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
