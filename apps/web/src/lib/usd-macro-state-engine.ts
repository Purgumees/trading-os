import type { FedRepricingYieldConfirmation } from "@/lib/fed-repricing-yield-confirmation";
import type { InflationAssessment } from "@/lib/inflation-state-engine";
import type { GrowthAssessment } from "@/lib/growth-state-engine";
import type { LabourAssessment } from "@/lib/labour-state-engine";
import type { UsRatesRegimeResult } from "@/lib/us-rates-regime-engine";
import type { UsRatesYieldCurveResult } from "@/lib/us-rates-yield-curve-engine";

export type UsdMacroBias =
  | "STRONGLY BULLISH"
  | "BULLISH"
  | "MILDLY BULLISH"
  | "NEUTRAL"
  | "MILDLY BEARISH"
  | "BEARISH"
  | "STRONGLY BEARISH";

export type UsdMacroTheme =
  | "FED REPRICING"
  | "INFLATION"
  | "LABOUR"
  | "GROWTH"
  | "FRONT-END RATES"
  | "LONG-END RATES"
  | "MIXED / NO DOMINANT THEME";

export type UsdMacroStateResult = {
  bias: UsdMacroBias;
  confidence: number;
  confidenceMethod: string;
  primaryTheme: UsdMacroTheme;
  secondaryTheme: UsdMacroTheme;
  themeExplanation: string;
  fundamentalState: {
    growth: { current: string; momentum: string; forward: string };
    labour: { current: string; momentum: string; wagePressure: string };
    inflation: {
      current: string;
      coreShortTerm: string;
      coreMediumTerm: string;
      headlineShortTerm: string;
      headlineMediumTerm: string;
      forwardPricePressure: string;
    };
  };
  macroImpulse: {
    growth: { direction: MacroImpulse; momentum: string };
    labour: { direction: MacroImpulse; momentum: string; wagePressure: string };
    inflation: {
      direction: MacroImpulse;
      coreShortTerm: string;
      coreMediumTerm: string;
      headlineShortTerm: string;
      headlineMediumTerm: string;
      forwardPricePressure: string;
    };
  };
  policyImpulse: {
    oneDay: string;
    oneWeek: string;
    oneMonth: string;
    primary: string;
    direction: "hawkish" | "dovish" | "neutral" | "unavailable";
  };
  marketConfirmation: {
    oneWeek: string;
    overall: string;
    ratesRegime: string;
    longEndDivergence: boolean | null;
  };
  primaryDriver: string;
  secondaryDriver: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  multiHorizonContext: string;
  whatChangesBias: string[];
  explanation: string;
};

type UsdMacroStateInput = {
  growth: Pick<GrowthAssessment, "state" | "momentum" | "forwardGrowth">;
  labour: Pick<LabourAssessment, "state" | "momentum" | "wagePressure">;
  inflation: Pick<InflationAssessment, "current"> & {
    forwardPricePressure: Pick<InflationAssessment["forwardPricePressure"], "state">;
    momentum: Pick<InflationAssessment["momentum"], "core" | "headline"> & {
      shortTerm: Pick<InflationAssessment["momentum"]["shortTerm"], "core" | "headline">;
      mediumTerm: Pick<InflationAssessment["momentum"]["mediumTerm"], "core" | "headline">;
    };
  };
  fedConfirmation: Pick<FedRepricingYieldConfirmation, "overall"> & {
    horizons: {
      [H in "oneDay" | "oneWeek" | "oneMonth"]: Pick<
        FedRepricingYieldConfirmation["horizons"][H],
        "fedState" | "state" | "twoYearDirection"
      >;
    };
  };
  ratesRegime: Pick<UsRatesRegimeResult, "primaryRegime"> & {
    horizons: {
      [H in "oneDay" | "oneWeek" | "oneMonth"]: Pick<
        UsRatesRegimeResult["horizons"][H],
        "regime"
      >;
    };
  };
  rates: {
    maturities: {
      [M in "2Y" | "10Y" | "30Y"]: {
        changes: {
          [H in "oneWeek" | "oneMonth"]: Pick<
            UsRatesYieldCurveResult["maturities"][M]["changes"][H],
            "changeBasisPoints" | "direction"
          >;
        };
      };
    };
  };
};

type Direction = -1 | 0 | 1 | null;
type MacroImpulse = "hawkish" | "dovish" | "neutral" | "mixed" | "unavailable";

const BIAS_ORDER: UsdMacroBias[] = [
  "STRONGLY BEARISH",
  "BEARISH",
  "MILDLY BEARISH",
  "NEUTRAL",
  "MILDLY BULLISH",
  "BULLISH",
  "STRONGLY BULLISH",
];

function fedDirection(state: string): Direction {
  if (state === "STRONGLY HAWKISH" || state === "HAWKISH") return 1;
  if (state === "STRONGLY DOVISH" || state === "DOVISH") return -1;
  if (state === "LITTLE / NO REPRICING") return 0;
  return null;
}

function fedStrength(state: string) {
  return state === "STRONGLY HAWKISH" || state === "STRONGLY DOVISH"
    ? "strong"
    : state === "HAWKISH" || state === "DOVISH"
      ? "ordinary"
      : "neutral";
}

function directionFromYieldClassification(direction: string): Direction {
  if (direction === "UNAVAILABLE") return null;
  if (direction.includes("RISE")) return 1;
  if (direction.includes("DECLINE")) return -1;
  return 0;
}

function isInflationHeating(momentum: string) {
  return momentum === "HEATING" || momentum === "HEATING RAPIDLY";
}

function isInflationCooling(momentum: string) {
  return momentum === "COOLING" || momentum === "COOLING RAPIDLY";
}

function macroImpulses(input: UsdMacroStateInput) {
  const growth: MacroImpulse =
    ["ACCELERATING", "IMPROVING"].includes(input.growth.momentum)
      ? "hawkish"
      : ["SLOWING", "DETERIORATING"].includes(input.growth.momentum)
        ? "dovish"
        : "neutral";
  const labour: MacroImpulse =
    input.labour.momentum === "UNAVAILABLE"
      ? "unavailable"
      : ["STRENGTHENING", "IMPROVING"].includes(input.labour.momentum)
        ? "hawkish"
        : ["COOLING", "DETERIORATING"].includes(input.labour.momentum)
          ? "dovish"
          : "neutral";
  const core = input.inflation.momentum.core;
  const inflation: MacroImpulse =
    core === "UNAVAILABLE"
      ? "unavailable"
      : isInflationHeating(core)
        ? "hawkish"
        : isInflationCooling(core)
          ? "dovish"
          : "neutral";
  return { growth, labour, inflation };
}

function primaryInflationTrend(input: UsdMacroStateInput) {
  const trends = [input.inflation.momentum.core, input.inflation.momentum.headline]
    .filter((trend) => trend !== "UNAVAILABLE");
  const heating = trends.filter(isInflationHeating).length;
  const cooling = trends.filter(isInflationCooling).length;
  if (heating > 0 && cooling > 0) return "mixed";
  if (heating > 0) return "heating";
  if (cooling > 0) return "cooling";
  return trends.length > 0 ? "stable" : "unavailable";
}

function repricingMagnitude(state: string) {
  if (state.startsWith("STRONGLY ")) return "strong";
  if (state === "HAWKISH" || state === "DOVISH") return "ordinary";
  return "neutral";
}

function classifyPolicyDirection(
  state: string
): "hawkish" | "dovish" | "neutral" | "unavailable" {
  const direction = fedDirection(state);
  if (direction === null) return "unavailable";
  if (direction === 0) return "neutral";
  return direction > 0 ? "hawkish" : "dovish";
}

function confirmationPhrase(state: string) {
  if (state === "STRONG CONFIRMATION") return "strongly confirms";
  if (state === "CONFIRMATION") return "confirms";
  if (state === "STRONG DIVERGENCE") return "strongly diverges";
  if (state === "DIVERGENCE") return "diverges";
  if (state === "MIXED / WEAK") return "is mixed or weak";
  return "is unavailable";
}

function getMacroAlignment(
  weeklyDirection: Direction,
  impulses: ReturnType<typeof macroImpulses>
) {
  const macroValues = [impulses.growth, impulses.labour, impulses.inflation].filter(
    (impulse) => impulse === "hawkish" || impulse === "dovish"
  );
  const hawkishMacro = macroValues.filter((impulse) => impulse === "hawkish").length;
  const dovishMacro = macroValues.filter((impulse) => impulse === "dovish").length;
  return weeklyDirection === null || weeklyDirection === 0
    ? 0
    : (weeklyDirection > 0 ? hawkishMacro : dovishMacro) -
        (weeklyDirection > 0 ? dovishMacro : hawkishMacro);
}

function reviewBiasEvidence(
  input: UsdMacroStateInput,
  impulses: ReturnType<typeof macroImpulses>,
  horizonContext: string,
  longEndDivergence: boolean | null
) {
  const weeklyDirection = fedDirection(input.fedConfirmation.horizons.oneWeek.fedState);
  const macroAlignment = getMacroAlignment(weeklyDirection, impulses);
  const macroDirections = [impulses.growth, impulses.labour, impulses.inflation].filter(
    (direction): direction is "hawkish" | "dovish" =>
      direction === "hawkish" || direction === "dovish"
  );
  const alignedMacroCount =
    weeklyDirection === null || weeklyDirection === 0
      ? 0
      : macroDirections.filter(
          (direction) => (weeklyDirection > 0 && direction === "hawkish") ||
            (weeklyDirection < 0 && direction === "dovish")
        ).length;
  const opposingMacroCount =
    weeklyDirection === null || weeklyDirection === 0
      ? 0
      : macroDirections.filter(
          (direction) => (weeklyDirection > 0 && direction === "dovish") ||
            (weeklyDirection < 0 && direction === "hawkish")
        ).length;
  const inflationPressure = input.inflation.forwardPricePressure.state;
  const forwardInflationOpposes =
    (weeklyDirection === -1 && (inflationPressure === "SURGING" || inflationPressure === "RISING")) ||
    (weeklyDirection === 1 && inflationPressure === "EASING");
  const weeklyRateRegime = input.ratesRegime.horizons.oneWeek.regime;
  const mixedLongEnd = weeklyRateRegime === "MIXED / UNCLEAR";
  const horizonConflict =
    horizonContext.includes("conflicts") || horizonContext.includes("inside a still-");
  const monthlyRateDirection = directionFromYieldClassification(
    input.rates.maturities["2Y"].changes.oneMonth.direction
  );
  const monthlyFedDirection = fedDirection(input.fedConfirmation.horizons.oneMonth.fedState);
  const monthlyAligned =
    weeklyDirection !== null &&
    weeklyDirection !== 0 &&
    monthlyRateDirection === weeklyDirection &&
    monthlyFedDirection === weeklyDirection;
  const strongPolicy =
    weeklyDirection !== null &&
    weeklyDirection !== 0 &&
    fedStrength(input.fedConfirmation.horizons.oneWeek.fedState) === "strong";
  const weeklyConfirmed =
    input.fedConfirmation.horizons.oneWeek.state === "CONFIRMATION" ||
    input.fedConfirmation.horizons.oneWeek.state === "STRONG CONFIRMATION";
  const broadAlignment =
    strongPolicy &&
    weeklyConfirmed &&
    alignedMacroCount >= 2 &&
    opposingMacroCount === 0 &&
    !forwardInflationOpposes &&
    !horizonConflict &&
    !mixedLongEnd &&
    longEndDivergence === false &&
    monthlyAligned;
  const contradictions: string[] = [];
  if (horizonConflict) {
    contradictions.push("Weekly and monthly 2Y direction conflict, limiting confidence in a durable directional rates impulse.");
  }
  if (mixedLongEnd) {
    contradictions.push("The weekly long-end rates regime is mixed/unclear and does not provide broad curve confirmation.");
  }
  if (longEndDivergence === true) {
    contradictions.push("10Y/30Y direction diverges from the weekly 2Y move.");
  }
  if (opposingMacroCount > 0) {
    contradictions.push(`${opposingMacroCount} macro momentum input${opposingMacroCount === 1 ? "" : "s"} oppose the 1W policy impulse.`);
  }
  if (forwardInflationOpposes) {
    contradictions.push(`Forward price pressure is ${inflationPressure.toLowerCase()}, countering the current policy-led impulse.`);
  }
  return {
    macroAlignment,
    alignedMacroCount,
    opposingMacroCount,
    forwardInflationOpposes,
    mixedLongEnd,
    horizonConflict,
    monthlyAligned,
    broadAlignment,
    longEndDivergence,
    contradictions,
  };
}

function scoreBias(
  input: UsdMacroStateInput,
  impulses: ReturnType<typeof macroImpulses>,
  broadAlignment: boolean
) {
  const weeklyFed = input.fedConfirmation.horizons.oneWeek.fedState;
  const weeklyDirection = fedDirection(weeklyFed);
  const weeklyConfirmation = input.fedConfirmation.horizons.oneWeek.state;
  const weeklyTwoYear = directionFromYieldClassification(
    input.rates.maturities["2Y"].changes.oneWeek.direction
  );
  const macroAlignment = getMacroAlignment(weeklyDirection, impulses);
  const confirmed =
    weeklyConfirmation === "CONFIRMATION" ||
    weeklyConfirmation === "STRONG CONFIRMATION";
  const divergent =
    weeklyConfirmation === "DIVERGENCE" ||
    weeklyConfirmation === "STRONG DIVERGENCE";
  const strongFed = fedStrength(weeklyFed) === "strong";

  if (weeklyDirection !== null && weeklyDirection !== 0) {
    const sign = weeklyDirection;
    let magnitude = strongFed ? 2 : 1;
    if (confirmed) magnitude += strongFed ? 1 : 1;
    if (divergent) magnitude -= 1;
    if (macroAlignment >= 2) magnitude += 1;
    if (macroAlignment <= -2) magnitude -= 1;
    if (weeklyTwoYear === 0) magnitude -= 1;
    magnitude = Math.max(0, Math.min(3, magnitude));
    if (magnitude === 3 && !broadAlignment) magnitude = 2;
    return {
      bias: sign > 0 ? BIAS_ORDER[3 + magnitude]! : BIAS_ORDER[3 - magnitude]!,
      sign,
      macroAlignment,
    };
  }

  const twoYear1w = weeklyTwoYear;
  const twoYear1m = directionFromYieldClassification(
    input.rates.maturities["2Y"].changes.oneMonth.direction
  );
  if (twoYear1w !== null && twoYear1w !== 0 && confirmed) {
    const horizonConflict = twoYear1m !== null && twoYear1m !== twoYear1w;
    const magnitude = horizonConflict ? 1 : 2;
    return {
      bias: twoYear1w < 0
        ? BIAS_ORDER[3 - magnitude]!
        : BIAS_ORDER[3 + magnitude]!,
      sign: twoYear1w > 0 ? 1 : -1,
      macroAlignment: 0,
    };
  }
  return { bias: "NEUTRAL" as const, sign: 0 as const, macroAlignment };
}

function classifyThemes(
  input: UsdMacroStateInput,
  impulses: ReturnType<typeof macroImpulses>
): { primary: UsdMacroTheme; secondary: UsdMacroTheme; reason: string; scores: Map<UsdMacroTheme, number> } {
  const scores = new Map<UsdMacroTheme, number>();
  const add = (theme: UsdMacroTheme, score: number) => {
    if (score > 0) scores.set(theme, (scores.get(theme) ?? 0) + score);
  };
  const oneWeekFed = input.fedConfirmation.horizons.oneWeek.fedState;
  const oneWeekFedDir = fedDirection(oneWeekFed);
  if (oneWeekFedDir !== null && oneWeekFedDir !== 0) {
    const confirmation = input.fedConfirmation.horizons.oneWeek.state;
    const confirmationAdjustment =
      confirmation === "STRONG CONFIRMATION" || confirmation === "CONFIRMATION"
        ? 2
        : confirmation === "STRONG DIVERGENCE" || confirmation === "DIVERGENCE"
          ? -1
          : 0;
    add(
      "FED REPRICING",
      (fedStrength(oneWeekFed) === "strong" ? 8 : 5) + confirmationAdjustment
    );
  }
  const twoYearWeekly = input.rates.maturities["2Y"].changes.oneWeek;
  if (twoYearWeekly.direction === "UNUSUALLY LARGE RISE" ||
      twoYearWeekly.direction === "UNUSUALLY LARGE DECLINE") {
    add("FRONT-END RATES", 6);
  } else if (twoYearWeekly.direction === "RISE" || twoYearWeekly.direction === "DECLINE") {
    add("FRONT-END RATES", 3);
  }

  const regimeWeekly = input.ratesRegime.horizons.oneWeek.regime;
  if (regimeWeekly !== "UNAVAILABLE" && regimeWeekly !== "MIXED / UNCLEAR") {
    add("LONG-END RATES", regimeWeekly.startsWith("BEAR") ? 4 : 3);
  }
  const inflationTrend = primaryInflationTrend(input);
  if (inflationTrend === "heating" || inflationTrend === "cooling") {
    const coreShort = input.inflation.momentum.shortTerm.core;
    const coreMedium = input.inflation.momentum.mediumTerm.core;
    const coherentCore =
      (isInflationHeating(coreShort) && isInflationHeating(coreMedium)) ||
      (isInflationCooling(coreShort) && isInflationCooling(coreMedium));
    add("INFLATION", coherentCore ? 5 : 3);
  }
  if (impulses.labour === "hawkish" || impulses.labour === "dovish") {
    add("LABOUR", input.labour.momentum === "STRENGTHENING" ||
      input.labour.momentum === "DETERIORATING" ? 4 : 3);
  }
  if (impulses.growth === "hawkish" || impulses.growth === "dovish") {
    add("GROWTH", input.growth.momentum === "ACCELERATING" ||
      input.growth.momentum === "DETERIORATING" ? 4 : 3);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || ranked[0]![1] < 3) {
    return {
      primary: "MIXED / NO DOMINANT THEME",
      secondary: "MIXED / NO DOMINANT THEME",
      reason: "No recent change has a sufficiently clear, material signal to dominate the current narrative.",
      scores,
    };
  }
  const primary = ranked[0]![0];
  const secondary =
    ranked[1] && ranked[1][1] >= ranked[0]![1] * 0.65
      ? ranked[1][0]
      : "MIXED / NO DOMINANT THEME";
  let reason: string;
  if (primary === "FED REPRICING") {
    const confirmation = input.fedConfirmation.horizons.oneWeek.state;
    reason = `The ${oneWeekFed} one-week Polymarket repricing is the clearest recent expectation change; the US 2Y front end ${confirmationPhrase(confirmation)} that move. Absolute economic levels are secondary.`;
  } else if (primary === "FRONT-END RATES") {
    reason = `The US 2Y made a historically unusual or meaningful weekly move, while the policy repricing signal is not as dominant.`;
  } else if (primary === "LONG-END RATES") {
    reason = `The weekly ${regimeWeekly.toLowerCase()} configuration is the clearest rates-market change; it is descriptive and does not identify its cause.`;
  } else if (primary === "INFLATION") {
    reason = `Core/headline inflation momentum is changing across recent horizons, making inflation the most evident macro impulse.`;
  } else if (primary === "LABOUR") {
    reason = `Labour momentum is changing and is more evident than the other available recent macro impulses.`;
  } else {
    reason = `Growth momentum is changing and is more evident than the other available recent macro impulses.`;
  }
  return { primary, secondary, reason, scores };
}

function buildHorizonContext(input: UsdMacroStateInput): string {
  const weeklyFed = fedDirection(input.fedConfirmation.horizons.oneWeek.fedState);
  const monthlyFed = fedDirection(input.fedConfirmation.horizons.oneMonth.fedState);
  const weeklyTwoYear = directionFromYieldClassification(
    input.rates.maturities["2Y"].changes.oneWeek.direction
  );
  const monthlyTwoYear = directionFromYieldClassification(
    input.rates.maturities["2Y"].changes.oneMonth.direction
  );
  const labels = {
    "1D": input.fedConfirmation.horizons.oneDay.fedState,
    "1W": input.fedConfirmation.horizons.oneWeek.fedState,
    "1M": input.fedConfirmation.horizons.oneMonth.fedState,
  };
  if (weeklyFed !== null && monthlyFed !== null && weeklyFed !== 0 && monthlyFed !== 0 && weeklyFed !== monthlyFed) {
    return `Weekly ${weeklyFed > 0 ? "hawkish" : "dovish"} repricing conflicts with ${monthlyFed > 0 ? "hawkish" : "dovish"} monthly context (${labels["1W"]} vs ${labels["1M"]}).`;
  }
  if (weeklyTwoYear !== null && monthlyTwoYear !== null && weeklyTwoYear !== 0 && monthlyTwoYear !== 0 && weeklyTwoYear !== monthlyTwoYear) {
    return `Weekly 2Y ${weeklyTwoYear > 0 ? "rise" : "decline"} inside a still-${monthlyTwoYear > 0 ? "higher" : "lower"} monthly rates backdrop.`;
  }
  if (weeklyFed !== null && monthlyFed !== null && weeklyFed !== 0 && weeklyFed === monthlyFed &&
      weeklyTwoYear !== null && monthlyTwoYear !== null && weeklyTwoYear === monthlyTwoYear && weeklyTwoYear !== 0) {
    return `Fed repricing and 2Y direction align across 1W and 1M (${weeklyFed > 0 ? "hawkish/rising" : "dovish/falling"} rates impulse).`;
  }
  if (weeklyFed !== null && weeklyFed !== 0 && input.fedConfirmation.horizons.oneDay.fedState !== "UNAVAILABLE") {
    return `1W is the primary policy horizon; 1D is tactical and ${input.fedConfirmation.horizons.oneDay.fedState.toLowerCase()} while the weekly repricing is ${input.fedConfirmation.horizons.oneWeek.fedState.toLowerCase()}.`;
  }
  if (weeklyTwoYear === null && monthlyTwoYear === null && weeklyFed === null && monthlyFed === null) {
    return "Multi-horizon policy and 2Y context is unavailable; no missing horizon was inferred.";
  }
  return "No material 1W/1M reversal or alignment can be established from the available horizon observations.";
}

function buildBiasConditions(
  input: UsdMacroStateInput,
  bias: UsdMacroBias,
  context: string,
  longEndDivergence: boolean | null
) {
  const conditions: string[] = [];
  const policy = input.fedConfirmation.horizons.oneWeek.fedState;
  const confirmation = input.fedConfirmation.horizons.oneWeek.state;
  if (policy.includes("DOVISH") || policy === "DOVISH") {
    conditions.push("A meaningful 1W shift from dovish toward hawkish Polymarket Fed repricing would challenge the current policy impulse.");
  } else if (policy.includes("HAWKISH") || policy === "HAWKISH") {
    conditions.push("A meaningful 1W shift from hawkish toward dovish Polymarket Fed repricing would challenge the current policy impulse.");
  } else {
    conditions.push("A clear, meaningful 1W Polymarket Fed repricing would establish a stronger policy direction than the current neutral/unavailable reading.");
  }
  if (confirmation === "CONFIRMATION" || confirmation === "STRONG CONFIRMATION") {
    conditions.push("A same-horizon US 2Y reversal that breaks the current Fed × 2Y confirmation would lower confidence.");
  } else if (confirmation === "DIVERGENCE" || confirmation === "STRONG DIVERGENCE") {
    conditions.push("The US 2Y moving back into the direction of 1W Fed repricing would remove the current front-end divergence.");
  } else {
    conditions.push("A clear 1W US 2Y move confirming or diverging from Fed repricing would resolve the currently weak/unavailable front-end evidence.");
  }
  if (context.includes("conflicts") || context.includes("inside a still-")) {
    conditions.push("1W and 1M policy/rates context returning to alignment would reduce the current multi-horizon conflict.");
  }
  if (longEndDivergence === true) {
    conditions.push("The 10Y/30Y moving back in line with the 2Y would reduce long-end divergence.");
  }
  const inflationTrends = [
    input.inflation.momentum.shortTerm.core,
    input.inflation.momentum.mediumTerm.core,
    input.inflation.momentum.shortTerm.headline,
    input.inflation.momentum.mediumTerm.headline,
  ];
  const anyCooling = inflationTrends.some(isInflationCooling);
  const anyHeating = inflationTrends.some(isInflationHeating);
  if (anyCooling && !anyHeating) {
    conditions.push("A material core/headline inflation reacceleration across short- and medium-term momentum would challenge the current cooling evidence.");
  } else if (anyHeating && !anyCooling) {
    conditions.push("Core/headline inflation cooling across short- and medium-term momentum would weaken the current heating impulse.");
  } else if (anyCooling && anyHeating) {
    conditions.push("Short- and medium-term inflation momentum resolving toward a sustained heating or cooling direction would change the current mixed inflation evidence.");
  }
  if (
    input.inflation.forwardPricePressure.state === "SURGING" ||
    input.inflation.forwardPricePressure.state === "RISING"
  ) {
    conditions.push("Forward price pressure easing—or persisting and feeding through into core inflation momentum—would change the current inflation-risk assessment.");
  }
  if (input.labour.momentum === "COOLING" || input.labour.momentum === "DETERIORATING") {
    conditions.push("A sustained turn from cooling to strengthening labour momentum would alter the current labour impulse.");
  } else if (input.labour.momentum === "STRENGTHENING" || input.labour.momentum === "IMPROVING") {
    conditions.push("A sustained turn from strengthening to cooling labour momentum would alter the current labour impulse.");
  }
  if (input.growth.momentum === "SLOWING" || input.growth.momentum === "DETERIORATING") {
    conditions.push("A sustained growth reacceleration would challenge the current weakening growth impulse.");
  } else if (input.growth.momentum === "ACCELERATING" || input.growth.momentum === "IMPROVING") {
    conditions.push("A sustained shift from improving to slowing growth momentum would challenge the current growth impulse.");
  } else {
    conditions.push("A material change in the currently stable growth momentum would alter the growth contribution to the macro outlook.");
  }
  if (bias === "NEUTRAL") {
    conditions.push("A coherent macro impulse that also changes Fed expectations and receives 2Y confirmation would be needed to establish directional bias.");
  }
  return [...new Set(conditions)];
}

function confidenceScore(
  input: UsdMacroStateInput,
  theme: UsdMacroTheme,
  impulses: ReturnType<typeof macroImpulses>,
  evidence: ReturnType<typeof reviewBiasEvidence>
) {
  let score = 30;
  const fedWeek = input.fedConfirmation.horizons.oneWeek.fedState;
  const confirmation = input.fedConfirmation.horizons.oneWeek.state;
  if (fedDirection(fedWeek) !== null) score += fedDirection(fedWeek) === 0 ? 5 : 15;
  if (confirmation === "CONFIRMATION" || confirmation === "DIVERGENCE") score += 10;
  if (confirmation === "STRONG CONFIRMATION" || confirmation === "STRONG DIVERGENCE") score += 15;
  if (theme !== "MIXED / NO DOMINANT THEME") score += 10;
  if (evidence.macroAlignment > 0) score += 10;
  if (evidence.macroAlignment < 0) score -= 10;
  const macroAvailable = [impulses.growth, impulses.labour, impulses.inflation]
    .filter((value) => value !== "unavailable").length;
  score += macroAvailable * 3;
  if (evidence.horizonConflict) score -= 10;
  if (evidence.mixedLongEnd) score -= 7;
  if (evidence.longEndDivergence === true) score -= 8;
  score -= Math.min(evidence.opposingMacroCount, 2) * 6;
  if (evidence.forwardInflationOpposes) score -= 7;
  if (fedWeek === "UNAVAILABLE") score -= 12;
  if (confirmation === "UNAVAILABLE" || confirmation === "MIXED / WEAK") score -= 8;
  return Math.max(0, Math.min(100, Math.round(score / 5) * 5));
}

function formatImpulse(impulse: MacroImpulse) {
  return impulse === "unavailable" ? "unavailable" : impulse;
}

export function calculateUsdMacroState(input: UsdMacroStateInput): UsdMacroStateResult {
  const impulses = macroImpulses(input);
  const themes = classifyThemes(input, impulses);
  const policyImpulse = {
    oneDay: input.fedConfirmation.horizons.oneDay.fedState,
    oneWeek: input.fedConfirmation.horizons.oneWeek.fedState,
    oneMonth: input.fedConfirmation.horizons.oneMonth.fedState,
    primary: input.fedConfirmation.horizons.oneWeek.fedState,
    direction: classifyPolicyDirection(input.fedConfirmation.horizons.oneWeek.fedState),
  } as const;
  const weeklyRegime = input.ratesRegime.horizons.oneWeek.regime;
  const weekly2Y = directionFromYieldClassification(input.rates.maturities["2Y"].changes.oneWeek.direction);
  const weeklyLongEnd = [
    directionFromYieldClassification(input.rates.maturities["10Y"].changes.oneWeek.direction),
    directionFromYieldClassification(input.rates.maturities["30Y"].changes.oneWeek.direction),
  ];
  const longEndDivergence =
    weekly2Y === null || weeklyLongEnd.some((direction) => direction === null)
      ? null
      : weeklyLongEnd.some((direction) => direction !== 0 && weekly2Y !== 0 && direction !== weekly2Y);
  const horizonContext = buildHorizonContext(input);
  const evidenceReview = reviewBiasEvidence(
    input,
    impulses,
    horizonContext,
    longEndDivergence
  );
  const biasResult = scoreBias(input, impulses, evidenceReview.broadAlignment);
  const bias = biasResult.bias;
  const confidence = confidenceScore(input, themes.primary, impulses, evidenceReview);

  const supportingEvidence: string[] = [];
  const contradictingEvidence: string[] = [];
  const policyDirection = policyImpulse.direction;
  if (policyDirection === "hawkish") {
    supportingEvidence.push(`1W Polymarket Fed repricing is ${policyImpulse.oneWeek.toLowerCase()}, a USD-positive policy impulse.`);
  } else if (policyDirection === "dovish") {
    supportingEvidence.push(`1W Polymarket Fed repricing is ${policyImpulse.oneWeek.toLowerCase()}, a USD-negative policy impulse.`);
  }
  const weeklyConfirmation = input.fedConfirmation.horizons.oneWeek.state;
  if (weeklyConfirmation === "CONFIRMATION" || weeklyConfirmation === "STRONG CONFIRMATION") {
    supportingEvidence.push(`The US 2Y ${input.fedConfirmation.horizons.oneWeek.twoYearDirection.toLowerCase()} on the same horizon and confirms the Fed repricing.`);
  } else if (weeklyConfirmation === "DIVERGENCE" || weeklyConfirmation === "STRONG DIVERGENCE") {
    contradictingEvidence.push("The US 2Y moved against 1W Fed repricing, reducing confidence in the policy impulse.");
  }
  const sign = biasResult.sign;
  const macroDescription: Array<[MacroImpulse, string]> = [
    [impulses.growth, "Growth momentum"],
    [impulses.labour, "Labour momentum"],
    [impulses.inflation, "Core inflation momentum"],
  ];
  for (const [impulse, label] of macroDescription) {
    if (impulse === "unavailable" || impulse === "neutral") continue;
    const aligned = (impulse === "hawkish" && sign > 0) || (impulse === "dovish" && sign < 0);
    (aligned ? supportingEvidence : contradictingEvidence).push(
      `${label} is ${impulse}, ${aligned ? "consistent with" : "in tension with"} the current policy-led USD impulse.`
    );
  }
  if (longEndDivergence === true) {
    contradictingEvidence.push("10Y/30Y direction differs from the 2Y on the weekly horizon; long-end divergence is kept separate from front-end confirmation.");
  }
  if (horizonContext.includes("conflicts") || horizonContext.includes("inside a still-")) {
    contradictingEvidence.push(horizonContext);
  }
  for (const contradiction of evidenceReview.contradictions) {
    if (!contradictingEvidence.includes(contradiction)) {
      contradictingEvidence.push(contradiction);
    }
  }
  if (supportingEvidence.length === 0) {
    supportingEvidence.push("No sufficiently aligned policy-and-rates evidence is currently available.");
  }
  if (contradictingEvidence.length === 0) {
    contradictingEvidence.push("No material contradiction identified in available inputs.");
  }

  const primaryDriver =
    themes.primary === "MIXED / NO DOMINANT THEME"
      ? "No dominant recent driver"
      : themes.primary === "FED REPRICING"
        ? `1W ${policyImpulse.oneWeek} Polymarket Fed repricing`
        : themes.primary === "FRONT-END RATES"
          ? `US 2Y weekly move (${input.rates.maturities["2Y"].changes.oneWeek.direction.toLowerCase()})`
          : themes.primary === "LONG-END RATES"
            ? `US long-end weekly ${weeklyRegime.toLowerCase()} regime`
            : themes.primary === "INFLATION"
              ? `Core inflation ${primaryInflationTrend(input)} momentum`
              : themes.primary === "LABOUR"
                ? `Labour ${input.labour.momentum.toLowerCase()} momentum`
                : `Growth ${input.growth.momentum.toLowerCase()} momentum`;
  const secondaryDriver =
    themes.secondary === "MIXED / NO DOMINANT THEME"
      ? "No clear secondary driver"
      : themes.secondary;
  const explanation =
    policyDirection === "hawkish" || policyDirection === "dovish"
      ? `${themes.reason} Recent macro momentum is growth ${input.growth.momentum.toLowerCase()}, labour ${input.labour.momentum.toLowerCase()}, and core inflation ${input.inflation.momentum.shortTerm.core.toLowerCase()} short term / ${input.inflation.momentum.mediumTerm.core.toLowerCase()} medium term; these data inform but do not mechanically dictate policy expectations. Fed expectations are ${policyDirection}, and the same-horizon US 2Y move ${weeklyConfirmation === "CONFIRMATION" || weeklyConfirmation === "STRONG CONFIRMATION" ? "confirms" : weeklyConfirmation === "DIVERGENCE" || weeklyConfirmation === "STRONG DIVERGENCE" ? "challenges" : "does not clearly confirm"} that repricing. This supports a ${bias.toLowerCase()} standalone USD macro assessment.`
      : `Recent macro momentum is growth ${formatImpulse(impulses.growth)}, labour ${formatImpulse(impulses.labour)}, and core inflation ${formatImpulse(impulses.inflation)}, but 1W Fed repricing is ${policyImpulse.oneWeek.toLowerCase()}. Without a clear policy-led impulse confirmed by the front end, the assessment remains ${bias.toLowerCase()}.`;

  return {
    bias,
    confidence,
    confidenceMethod:
      "Evidence-alignment rubric, not a probability: starts at 30; adds for meaningful 1W Fed repricing, same-horizon 2Y confirmation, a clear recent theme, aligned macro momentum, and available macro groups; subtracts for 1W/1M conflict, mixed long-end structure, 2Y/long-end divergence, opposing macro momentum, forward inflation pressure opposing the policy impulse, or missing core inputs. Rounded to 5-point increments. Extreme bias additionally requires strong policy repricing, 2Y confirmation, at least two aligned macro momentum groups, no material counter-evidence, a non-mixed long-end regime, and aligned 1W/1M Fed and 2Y directions.",
    primaryTheme: themes.primary,
    secondaryTheme: themes.secondary,
    themeExplanation: themes.reason,
    fundamentalState: {
      growth: {
        current: input.growth.state,
        momentum: input.growth.momentum,
        forward: input.growth.forwardGrowth,
      },
      labour: {
        current: input.labour.state,
        momentum: input.labour.momentum,
        wagePressure: input.labour.wagePressure,
      },
      inflation: {
        current: input.inflation.current.overall,
        coreShortTerm: input.inflation.momentum.shortTerm.core,
        coreMediumTerm: input.inflation.momentum.mediumTerm.core,
        headlineShortTerm: input.inflation.momentum.shortTerm.headline,
        headlineMediumTerm: input.inflation.momentum.mediumTerm.headline,
        forwardPricePressure: input.inflation.forwardPricePressure.state,
      },
    },
    macroImpulse: {
      growth: {
        direction: impulses.growth,
        momentum: input.growth.momentum,
      },
      labour: {
        direction: impulses.labour,
        momentum: input.labour.momentum,
        wagePressure: input.labour.wagePressure,
      },
      inflation: {
        direction: impulses.inflation,
        coreShortTerm: input.inflation.momentum.shortTerm.core,
        coreMediumTerm: input.inflation.momentum.mediumTerm.core,
        headlineShortTerm: input.inflation.momentum.shortTerm.headline,
        headlineMediumTerm: input.inflation.momentum.mediumTerm.headline,
        forwardPricePressure: input.inflation.forwardPricePressure.state,
      },
    },
    policyImpulse,
    marketConfirmation: {
      oneWeek: weeklyConfirmation,
      overall: input.fedConfirmation.overall,
      ratesRegime: weeklyRegime,
      longEndDivergence,
    },
    primaryDriver,
    secondaryDriver,
    supportingEvidence,
    contradictingEvidence,
    multiHorizonContext: horizonContext,
    whatChangesBias: buildBiasConditions(input, bias, horizonContext, longEndDivergence),
    explanation,
  };
}
