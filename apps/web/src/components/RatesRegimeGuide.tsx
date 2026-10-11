export function RatesRegimeGuide() {
  return (
    <aside
      className="self-start rounded-xl border bg-muted/30 p-5 text-sm"
      aria-label="Yield regime explanation"
    >
      <h3 className="font-semibold">What does this mean?</h3>
      <p className="mt-2 text-muted-foreground">
        Short-term = 2Y. Long-term = 10Y and 30Y. “Faster” means a larger change in basis points
        over the same period.
      </p>
      <div className="mt-4 rounded-lg border bg-background p-3">
        <p className="font-medium">Long-term yields falling faster</p>
        <p className="mt-2 text-muted-foreground">
          Example: 2Y falls 2 bp and 10Y falls 6 bp. The 10Y minus 2Y gap shrinks by 4 bp: bull
          flattening.
        </p>
        <p className="mt-2 text-muted-foreground">
          Falling yields go with rising bond prices. Possible drivers include lower long-term
          inflation or growth expectations, demand for safer assets, or a lower term premium. The
          yield move alone cannot identify the cause.
        </p>
      </div>
      <dl className="mt-4 space-y-3">
        <div>
          <dt className="font-medium">Bull flattening</dt>
          <dd className="mt-1 text-muted-foreground">
            Yields fall; long-term yields fall more. The gap narrows.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Bull steepening</dt>
          <dd className="mt-1 text-muted-foreground">
            Yields fall; the 2Y falls more. The gap widens. This can accompany stronger expectations
            of Fed cuts.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Bear steepening</dt>
          <dd className="mt-1 text-muted-foreground">
            Yields rise; long-term yields rise more. The gap widens. Possible drivers include
            inflation concerns, bond supply or a higher term premium.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Bear flattening</dt>
          <dd className="mt-1 text-muted-foreground">
            Yields rise; the 2Y rises more. The gap narrows. This can accompany expectations of
            tighter Fed policy.
          </dd>
        </div>
      </dl>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Bull / bear refers to bond prices. These labels alone do not determine USD, gold or stock
        direction. Different horizons can show different regimes.
      </p>
      <a
        className="mt-2 inline-block text-xs underline"
        href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-86"
        target="_blank"
        rel="noreferrer"
      >
        SEC · bond prices and yields
      </a>
    </aside>
  );
}
