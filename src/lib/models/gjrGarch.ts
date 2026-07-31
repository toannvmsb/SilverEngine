// GJR-GARCH(1,1) — section 7 "Forecast volatility bất đối xứng" (Phase 2).
//
// This is a CHALLENGER model: it is fit here, its forecast is compared
// against the champion (EWMA, used in the live decision engine) on the
// Model Governance page, and is never wired into computeDecision/LTV
// automatically. Promoting it to champion is a human governance action
// (section 2 "Human governance, not human data entry" / section 14
// champion-challenger), matching model_registry.is_champion.
//
// Fit via a from-scratch Nelder-Mead simplex maximizing the conditional
// Gaussian log-likelihood, since pulling in a full optimization library for
// one model would be overkill. This is a legitimate but basic MLE — no
// standard errors, no robustness checks beyond a positivity/stationarity
// penalty. With only a few dozen to a few hundred days of self-accumulated
// price history, treat the fit as indicative, not something to trust with
// real money without a proper backtest (section 15).
//
//   sigma2_t = omega + alpha*eps_{t-1}^2 + gamma*I_{t-1}*eps_{t-1}^2 + beta*sigma2_{t-1}
//   I_{t-1} = 1 if eps_{t-1} < 0 else 0   (negative shocks raise vol more — leverage effect)

export interface GjrGarchParams {
  omega: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface GjrGarchFitResult {
  params: GjrGarchParams;
  logLikelihood: number;
  converged: boolean;
  observations: number;
}

function negLogLikelihood(params: number[], returns: number[]): number {
  const [omega, alpha, beta, gamma] = params;

  // Penalize infeasible regions instead of hard-constraining the optimizer
  // (simpler to implement correctly than a constrained solver).
  const persistence = alpha + beta + gamma / 2;
  if (omega <= 0 || alpha < 0 || beta < 0 || alpha + gamma < 0 || persistence >= 0.999) {
    return 1e10 + (Math.abs(persistence) + Math.abs(Math.min(0, omega)) + Math.abs(Math.min(0, alpha)) + Math.abs(Math.min(0, beta))) * 1e6;
  }

  const sampleVar = variance(returns);
  let sigma2 = sampleVar > 0 ? sampleVar : 1e-6;
  let ll = 0;
  for (let t = 1; t < returns.length; t++) {
    const epsPrev = returns[t - 1];
    const indicator = epsPrev < 0 ? 1 : 0;
    sigma2 = omega + alpha * epsPrev * epsPrev + gamma * indicator * epsPrev * epsPrev + beta * sigma2;
    if (!Number.isFinite(sigma2) || sigma2 <= 0) return 1e10;
    const eps = returns[t];
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(sigma2) + (eps * eps) / sigma2);
  }
  return -ll;
}

function variance(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
}

/** Generic Nelder-Mead simplex minimizer — no external dependency needed for a 4-parameter fit. */
function nelderMead(f: (x: number[]) => number, x0: number[], maxIter = 2000): { x: number[]; fx: number; converged: boolean } {
  const n = x0.length;
  const alpha = 1,
    gammaExp = 2,
    rho = 0.5,
    sigma = 0.5;

  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const point = x0.slice();
    point[i] += point[i] !== 0 ? point[i] * 0.1 : 0.01;
    simplex.push(point);
  }
  let values = simplex.map(f);

  for (let iter = 0; iter < maxIter; iter++) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);

    if (Math.abs(values[n] - values[0]) < 1e-10) return { x: simplex[0], fx: values[0], converged: true };

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;

    const reflected = centroid.map((c, j) => c + alpha * (c - simplex[n][j]));
    const fReflected = f(reflected);

    if (fReflected < values[0]) {
      const expanded = centroid.map((c, j) => c + gammaExp * (reflected[j] - c));
      const fExpanded = f(expanded);
      if (fExpanded < fReflected) {
        simplex[n] = expanded;
        values[n] = fExpanded;
      } else {
        simplex[n] = reflected;
        values[n] = fReflected;
      }
    } else if (fReflected < values[n - 1]) {
      simplex[n] = reflected;
      values[n] = fReflected;
    } else {
      const contracted = centroid.map((c, j) => c + rho * (simplex[n][j] - c));
      const fContracted = f(contracted);
      if (fContracted < values[n]) {
        simplex[n] = contracted;
        values[n] = fContracted;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + sigma * (v - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  return { x: simplex[order[0]], fx: values[order[0]], converged: false };
}

const MIN_OBSERVATIONS = 40;

export function fitGjrGarch(logReturns: number[]): GjrGarchFitResult | null {
  if (logReturns.length < MIN_OBSERVATIONS) return null;

  const sampleVar = variance(logReturns);
  const x0 = [sampleVar * 0.05, 0.05, 0.85, 0.05]; // typical starting values for daily financial returns

  const result = nelderMead((p) => negLogLikelihood(p, logReturns), x0, 3000);
  const [omega, alpha, beta, gamma] = result.x;

  return {
    params: { omega, alpha, beta, gamma },
    logLikelihood: -result.fx,
    converged: result.converged,
    observations: logReturns.length,
  };
}

const TRADING_DAYS_PER_YEAR = 365;

/** Multi-day-ahead annualized vol forecast via the standard GARCH forward-variance recursion. */
export function forecastGjrGarchVol(fit: GjrGarchFitResult, logReturns: number[], horizonDays: number): number {
  const { omega, alpha, beta, gamma } = fit.params;
  let sigma2 = variance(logReturns);
  for (let t = 1; t < logReturns.length; t++) {
    const epsPrev = logReturns[t - 1];
    const indicator = epsPrev < 0 ? 1 : 0;
    sigma2 = omega + alpha * epsPrev * epsPrev + gamma * indicator * epsPrev * epsPrev + beta * sigma2;
  }

  // E[I]=0.5 under a symmetric-residual assumption for the forward recursion.
  const persistence = alpha + gamma / 2 + beta;
  let cumulativeVar = 0;
  let stepVar = sigma2;
  for (let h = 0; h < horizonDays; h++) {
    stepVar = omega + persistence * stepVar;
    cumulativeVar += stepVar;
  }
  const dailyAvgVar = cumulativeVar / horizonDays;
  return Math.sqrt(dailyAvgVar * TRADING_DAYS_PER_YEAR);
}
