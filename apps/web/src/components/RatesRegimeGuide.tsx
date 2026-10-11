export function RatesRegimeGuide() {
  return (
    <aside
      className="self-start rounded-xl border bg-muted/30 p-5 text-sm"
      aria-label="Yield regime explanation"
    >
      <h3 className="font-semibold">How can this affect USD / DXY?</h3>
      <dl className="mt-4 space-y-4">
        <div>
          <dt className="font-medium">Bull flattening · USD impact depends on the cause</dt>
          <dd className="mt-1 text-muted-foreground">
            Falling long-term yields can weigh on USD if they reflect weaker US growth or lower
            expected rates relative to other countries. But if investors seek safety, USD can
            strengthen even while Treasury yields fall.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Bull steepening · can weaken USD</dt>
          <dd className="mt-1 text-muted-foreground">
            A larger fall in the 2Y can reflect more Fed cuts being priced in. If US rates fall
            relative to foreign rates, the dollar loses some yield advantage. If foreign rates fall
            even more, USD may still strengthen.
          </dd>
        </div>
        <div>
          <dt className="font-medium">
            Bear steepening · higher yields do not guarantee stronger USD
          </dt>
          <dd className="mt-1 text-muted-foreground">
            Rising long-term yields may support USD when driven by stronger US growth or higher real
            yields. If they rise because investors demand extra compensation for inflation, debt
            supply or fiscal risk, USD can stay weak despite higher yields.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Bear flattening · can strengthen USD</dt>
          <dd className="mt-1 text-muted-foreground">
            A larger rise in the 2Y can reflect more Fed hikes or fewer cuts. When this increases
            expected US rates relative to foreign rates, it can support USD. An already-priced-in
            move may have little new effect.
          </dd>
        </div>
      </dl>
      <div className="mt-4 rounded-lg border bg-background p-3">
        <p className="font-medium">What to check for DXY</p>
        <p className="mt-2 text-muted-foreground">
          Compare US rate expectations with those abroad, especially the euro area. Then check risk
          sentiment and whether rising yields reflect real returns or inflation. The curve label
          alone gives no confirmed DXY direction.
        </p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Educational scenarios; this box does not calculate a live DXY signal.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <a
          className="underline"
          href="https://www.federalreserve.gov/econres/notes/ifdp-notes/the-sensitivity-of-the-us-dollar-exchange-rate-to-changes-in-monetary-policy-expectations-20170922.htm"
          target="_blank"
          rel="noreferrer"
        >
          Fed · rates and USD
        </a>
        <a
          className="underline"
          href="https://www.federalreserve.gov/econres/notes/feds-notes/monetary-policy-and-exchange-rates-during-the-global-tightening-20240510.html"
          target="_blank"
          rel="noreferrer"
        >
          Fed · rates and risk sentiment
        </a>
      </div>
    </aside>
  );
}
