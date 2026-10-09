import type { FedRepricingYieldConfirmation } from "@/lib/fed-repricing-yield-confirmation";
import type { UsRatesYieldCurveResult } from "@/lib/us-rates-yield-curve-engine";

export type RatesRegime =
  | "PARALLEL RALLY"
  | "PARALLEL SELLOFF"
  | "BULL STEEPENING"
  | "BEAR STEEPENING"
  | "BULL FLATTENING"
  | "BEAR FLATTENING"
  | "MIXED / UNCLEAR"
  | "UNAVAILABLE";

export type FrontEndFedConfirmation =
  | "CONFIRMED"
  | "DIVERGING"
  | "UNAVAILABLE";

type RegimeHorizon = "oneDay" | "oneWeek" | "oneMonth";

type RatesRegimeHorizonResult = {
  horizon: RegimeHorizon;
  label: "1D" | "1W" | "1M";
  changes: {
    "2Y": number | null;
    "10Y": number | null;
    "30Y": number | null;
    "2s10s": number | null;
    "2s30s": number | null;
  };
  curveDirection: "STEEPENING" | "FLATTENING" | "STABLE" | "MIXED" | "UNAVAILABLE";
  regime: RatesRegime;
  yieldMovement: string;
  explanation: string;
};

export type UsRatesRegimeResult = {
  source: "FRED US Treasury yields";
  fedExpectationsSource: "Polymarket";
  status: "available" | "unavailable";
  horizons: Record<RegimeHorizon, RatesRegimeHorizonResult>;
  primaryHorizon: "1W";
  primaryRegime: RatesRegime;
  frontEndFedConfirmation: FrontEndFedConfirmation;
  explanation: string;
};

const HORIZONS = [
  { key: "oneDay", label: "1D" },
  { key: "oneWeek", label: "1W" },
  { key: "oneMonth", label: "1M" },
] as const;

function direction(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.sign(value);
}

function movementPhrase(maturity: string, value: number | null) {
  if (value === null) return `${maturity} yield movement is unavailable`;
  if (value > 0) return `${maturity} yield rose`;
  if (value < 0) return `${maturity} yield declined`;
  return `${maturity} yield was unchanged`;
}

function arrowForChange(value: number | null) {
  if (value === null) return "UNAVAILABLE";
  if (value > 0) return "↑";
  if (value < 0) return "↓";
  return "STABLE";
}

function describeYieldMovement(
  change2Y: number | null,
  change10Y: number | null,
  change30Y: number | null
) {
  if (change2Y === null || change10Y === null || change30Y === null) {
    return "YIELD MOVEMENT UNAVAILABLE";
  }

  const short = direction(change2Y)!;
  const tenYear = direction(change10Y)!;
  const thirtyYear = direction(change30Y)!;
  if (short === tenYear && tenYear === thirtyYear) {
    if (short === 0) return "ALL YIELDS STABLE";
    return short < 0 ? "ALL YIELDS ↓" : "ALL YIELDS ↑";
  }

  const long =
    tenYear === thirtyYear
      ? arrowForChange(change10Y)
      : tenYear === 0 && thirtyYear !== 0
        ? `STABLE / ${arrowForChange(change30Y)}`
        : thirtyYear === 0 && tenYear !== 0
          ? `${arrowForChange(change10Y)} / STABLE`
          : `MIXED (10Y ${arrowForChange(change10Y)} / 30Y ${arrowForChange(change30Y)})`;
  return `SHORT-TERM YIELDS ${arrowForChange(change2Y)} / LONG-TERM YIELDS ${long}`;
}

function describeActualMaturities(
  change2Y: number | null,
  change10Y: number | null,
  change30Y: number | null
) {
  if (change2Y === null || change10Y === null || change30Y === null) {
    return "Matched yield changes are unavailable.";
  }
  const short = movementPhrase("2Y", change2Y);
  const tenYear = movementPhrase("10Y", change10Y);
  const thirtyYear = movementPhrase("30Y", change30Y);
  if (direction(change2Y) === direction(change10Y) && direction(change10Y) === direction(change30Y)) {
    return `The 2Y, 10Y, and 30Y yields ${direction(change2Y)! < 0 ? "are falling" : direction(change2Y)! > 0 ? "are rising" : "are stable"}.`;
  }
  return `${short[0]?.toUpperCase()}${short.slice(1)} while ${tenYear} and ${thirtyYear}.`;
}

function curveDirection(
  spread210: number | null,
  spread230: number | null,
  direction210: string,
  direction230: string
): RatesRegimeHorizonResult["curveDirection"] {
  if (spread210 === null || spread230 === null) return "UNAVAILABLE";
  const stable210 = direction210 === "STABLE";
  const stable230 = direction230 === "STABLE";
  if (stable210 && stable230) return "STABLE";
  if (
    (spread210 > 0 && spread230 > 0) ||
    (spread210 >= 0 && stable230) ||
    (spread230 >= 0 && stable210)
  ) {
    return "STEEPENING";
  }
  if (
    (spread210 < 0 && spread230 < 0) ||
    (spread210 <= 0 && stable230) ||
    (spread230 <= 0 && stable210)
  ) {
    return "FLATTENING";
  }
  return "MIXED";
}

function classifyRegime({
  change2Y,
  change10Y,
  change30Y,
  spread210,
  spread230,
  spread210Direction,
  spread230Direction,
}: {
  change2Y: number | null;
  change10Y: number | null;
  change30Y: number | null;
  spread210: number | null;
  spread230: number | null;
  spread210Direction: string;
  spread230Direction: string;
}): { regime: RatesRegime; curve: RatesRegimeHorizonResult["curveDirection"] } {
  const curve = curveDirection(
    spread210,
    spread230,
    spread210Direction,
    spread230Direction
  );
  const signs = [direction(change2Y), direction(change10Y), direction(change30Y)];
  if (signs.some((sign) => sign === null) || curve === "UNAVAILABLE") {
    return { regime: "UNAVAILABLE", curve };
  }

  const [front, belly, long] = signs as [number, number, number];
  if (
    front === belly &&
    belly === long &&
    front !== 0 &&
    curve === "STABLE"
  ) {
    return {
      regime: front < 0 ? "PARALLEL RALLY" : "PARALLEL SELLOFF",
      curve,
    };
  }

  if (curve === "STEEPENING" || curve === "FLATTENING") {
    const longEndDirection =
      belly !== 0 && long !== 0 && belly !== long ? null : belly || long;
    if (longEndDirection === null || front === 0 || longEndDirection === 0) {
      return { regime: "MIXED / UNCLEAR", curve };
    }
    const bull = front < 0 && longEndDirection < 0;
    const bear = front > 0 && longEndDirection > 0;
    if (!bull && !bear) return { regime: "MIXED / UNCLEAR", curve };
    if (curve === "STEEPENING") {
      return { regime: bull ? "BULL STEEPENING" : "BEAR STEEPENING", curve };
    }
    return { regime: bull ? "BULL FLATTENING" : "BEAR FLATTENING", curve };
  }

  return { regime: "MIXED / UNCLEAR", curve };
}

function buildHorizon(
  rates: UsRatesYieldCurveResult,
  horizon: (typeof HORIZONS)[number]
): RatesRegimeHorizonResult {
  const move2Y = rates.maturities["2Y"].changes[horizon.key];
  const move10Y = rates.maturities["10Y"].changes[horizon.key];
  const move30Y = rates.maturities["30Y"].changes[horizon.key];
  const spread210 = rates.yieldCurve["2Y-10Y"].changes[horizon.key];
  const spread230 = rates.yieldCurve["2Y-30Y"].changes[horizon.key];
  const classification = classifyRegime({
    change2Y: move2Y.changeBasisPoints,
    change10Y: move10Y.changeBasisPoints,
    change30Y: move30Y.changeBasisPoints,
    spread210: spread210.changeBasisPoints,
    spread230: spread230.changeBasisPoints,
    spread210Direction: spread210.direction,
    spread230Direction: spread230.direction,
  });
  const unavailableCount = [
    move2Y.changeBasisPoints,
    move10Y.changeBasisPoints,
    move30Y.changeBasisPoints,
    spread210.changeBasisPoints,
    spread230.changeBasisPoints,
  ].filter((change) => change === null).length;
  const regime =
    classification.regime !== "UNAVAILABLE" && unavailableCount > 0
      ? "UNAVAILABLE"
      : classification.regime;
  const yieldMovement = describeYieldMovement(
    move2Y.changeBasisPoints,
    move10Y.changeBasisPoints,
    move30Y.changeBasisPoints
  );
  let explanation: string;
  if (regime === "UNAVAILABLE") {
    explanation = `${horizon.label} rate-regime comparison is unavailable because one or more matched yield or spread changes are missing.`;
  } else {
    const curveExplanation =
      classification.curve === "MIXED"
        ? `The yield curve is mixed/unclear: 2Y–10Y spread is ${spread210.direction.toLowerCase()}, while 2Y–30Y spread is ${spread230.direction.toLowerCase()}.`
        : `Yield curve: ${classification.curve.toLowerCase()}.`;
    explanation = `${describeActualMaturities(
      move2Y.changeBasisPoints,
      move10Y.changeBasisPoints,
      move30Y.changeBasisPoints
    )} ${curveExplanation}`;
  }

  return {
    horizon: horizon.key,
    label: horizon.label,
    changes: {
      "2Y": move2Y.changeBasisPoints,
      "10Y": move10Y.changeBasisPoints,
      "30Y": move30Y.changeBasisPoints,
      "2s10s": spread210.changeBasisPoints,
      "2s30s": spread230.changeBasisPoints,
    },
    curveDirection: classification.curve,
    regime,
    yieldMovement,
    explanation,
  };
}

function mapFedConfirmation(
  confirmation: FedRepricingYieldConfirmation["overall"]
): FrontEndFedConfirmation {
  if (confirmation === "CONFIRMED" || confirmation === "STRONGLY CONFIRMED") {
    return "CONFIRMED";
  }
  if (confirmation === "DIVERGING" || confirmation === "STRONGLY DIVERGING") {
    return "DIVERGING";
  }
  return "UNAVAILABLE";
}

export function calculateUsRatesRegime({
  rates,
  fedConfirmation,
}: {
  rates: UsRatesYieldCurveResult;
  fedConfirmation: FedRepricingYieldConfirmation;
}): UsRatesRegimeResult {
  const horizons = Object.fromEntries(
    HORIZONS.map((horizon) => [horizon.key, buildHorizon(rates, horizon)])
  ) as Record<RegimeHorizon, RatesRegimeHorizonResult>;
  const primary = horizons.oneWeek;
  return {
    source: "FRED US Treasury yields",
    fedExpectationsSource: "Polymarket",
    status: primary.regime === "UNAVAILABLE" ? "unavailable" : "available",
    horizons,
    primaryHorizon: "1W",
    primaryRegime: primary.regime,
    frontEndFedConfirmation: mapFedConfirmation(fedConfirmation.overall),
    explanation:
      primary.regime === "UNAVAILABLE"
        ? "The primary 1W US rates regime is unavailable because matched yield and spread changes are incomplete."
        : `Over the primary 1W horizon, ${primary.explanation[0]?.toLowerCase()}${primary.explanation.slice(1)}`,
  };
}
