import { describe, expect, it } from "vitest";
import { expectedPriceHaircut, historicalSimulationES, parametricEwmaES } from "./expectedShortfall";

describe("parametricEwmaES", () => {
  it("matches the exact closed-form normal half-distribution mean at q=0.5", () => {
    // For a standard normal, the median is 0 (so VaR_50% = 0 exactly) and
    // E[X | X < median] = -sigma*sqrt(2/pi) (half-normal distribution mean)
    // — this lets us check the implementation against an exact value instead
    // of only property-based assertions.
    const annualizedVol = 0.3;
    const horizonDays = 91;
    const result = parametricEwmaES(annualizedVol, horizonDays, 0.5);
    const sigmaH = annualizedVol * Math.sqrt(horizonDays / 365);
    expect(result.varQ).toBeCloseTo(0, 6);
    expect(result.esQ).toBeCloseTo(-sigmaH * Math.sqrt(2 / Math.PI), 6);
  });

  it("is always negative (a shortfall) for any sub-50% tail", () => {
    for (const q of [0.01, 0.025, 0.05, 0.1]) {
      const result = parametricEwmaES(0.25, 30, q);
      expect(result.esQ).toBeLessThan(0);
      expect(result.varQ).toBeLessThan(0);
    }
  });

  it("ES is at least as extreme as VaR at the same quantile (tail mean <= tail cutoff)", () => {
    const result = parametricEwmaES(0.25, 30, 0.01);
    expect(result.esQ).toBeLessThanOrEqual(result.varQ);
  });

  it("a smaller tail probability produces a more extreme (more negative) ES", () => {
    const es1 = parametricEwmaES(0.25, 30, 0.01).esQ;
    const es5 = parametricEwmaES(0.25, 30, 0.05).esQ;
    expect(es1).toBeLessThan(es5);
  });

  it("scales linearly with annualized vol, holding horizon and quantile fixed", () => {
    const base = parametricEwmaES(0.2, 30, 0.01).esQ;
    const doubled = parametricEwmaES(0.4, 30, 0.01).esQ;
    expect(doubled).toBeCloseTo(base * 2, 8);
  });

  it("scales with sqrt(horizon), holding vol and quantile fixed", () => {
    const h30 = parametricEwmaES(0.25, 30, 0.01).esQ;
    const h120 = parametricEwmaES(0.25, 120, 0.01).esQ;
    expect(h120).toBeCloseTo(h30 * 2, 5); // sqrt(120/30) = 2
  });

  it("tags the method as parametric_ewma", () => {
    expect(parametricEwmaES(0.25, 30, 0.01).method).toBe("parametric_ewma");
  });
});

describe("historicalSimulationES", () => {
  it("throws when there are fewer than 10 overlapping windows", () => {
    const shortSeries = Array.from({ length: 15 }, (_, i) => 100 + i);
    expect(() => historicalSimulationES(shortSeries, 10, 0.05)).toThrow();
  });

  it("computes VaR/ES from a deterministic series with a known worst window", () => {
    // Construct a price series with one clearly worst h=1 daily drop and
    // enough windows to make the 5% tail land exactly on it.
    const prices = [100];
    for (let i = 0; i < 19; i++) prices.push(prices[prices.length - 1] * 1.01); // 19 mild +1% days
    prices.push(prices[prices.length - 1] * 0.5); // one catastrophic -50% day

    const result = historicalSimulationES(prices, 1, 0.05);
    // With 20 one-day windows, the single -50% day is the extreme tail.
    expect(result.esQ).toBeLessThan(-0.5); // log(0.5) ~= -0.693
    expect(result.esQ).toBeLessThanOrEqual(result.varQ);
    expect(result.method).toBe("historical_simulation");
  });

  it("ES is more negative for a smaller tail probability on the same data", () => {
    const prices = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 5) + i * 0.1);
    const es1 = historicalSimulationES(prices, 5, 0.01).esQ;
    const es10 = historicalSimulationES(prices, 5, 0.1).esQ;
    expect(es1).toBeLessThanOrEqual(es10);
  });
});

describe("expectedPriceHaircut", () => {
  it("takes the larger of the model's ES magnitude and the policy floor", () => {
    const es = { horizonDays: 30, varQ: -0.05, esQ: -0.08, method: "parametric_ewma" as const };
    expect(expectedPriceHaircut(es, 0.03)).toBeCloseTo(0.08, 10); // |esQ| > floor
    expect(expectedPriceHaircut(es, 0.15)).toBeCloseTo(0.15, 10); // floor > |esQ|
  });
});
