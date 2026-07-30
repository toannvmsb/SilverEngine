// Local scheduler — runs ingestion + portfolio revaluation on a fixed
// interval, standing in for a real cron/Vercel Cron/Temporal job until this
// is deployed somewhere (section 14 "Scheduler dùng Temporal/Airflow/Celery
// Beat"). Run it in a second terminal alongside `npm run dev`:
//
//   npm run scheduler
//
// It talks to the database directly (same Prisma client as the Next app) —
// no HTTP/session auth involved, so it keeps running across Next dev-server
// restarts. Ctrl+C to stop.

import { runIngestion } from "../src/lib/ingestion/runIngestion";
import { runStressTest } from "../src/lib/portfolio/runStressTest";

const INGESTION_INTERVAL_MS = Number(process.env.INGESTION_INTERVAL_MINUTES ?? 15) * 60_000;
const STRESS_TEST_INTERVAL_MS = Number(process.env.STRESS_TEST_INTERVAL_MINUTES ?? 5) * 60_000;

function log(msg: string) {
  console.log(`[scheduler ${new Date().toISOString()}] ${msg}`);
}

async function tickIngestion() {
  try {
    const result = await runIngestion("scheduler");
    const summary = result.results.map((r) => `${r.sourceId}=${r.status}`).join(", ");
    log(`ingestion done — regime=${result.regime} score=${result.riskScore} | ${summary}`);
  } catch (e) {
    log(`ingestion FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function tickStressTest() {
  try {
    const result = await runStressTest();
    if ("error" in result) {
      log(`stress test skipped: ${result.error}`);
      return;
    }
    log(
      `stress test done — ${result.contractsEvaluated} contracts, ${result.valuationsCreated} valuations, critical=${result.critical} high=${result.high} warning=${result.warning}`
    );
  } catch (e) {
    log(`stress test FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  log(`starting — ingestion every ${INGESTION_INTERVAL_MS / 60_000}min, stress test every ${STRESS_TEST_INTERVAL_MS / 60_000}min`);

  await tickIngestion();
  await tickStressTest();

  setInterval(tickIngestion, INGESTION_INTERVAL_MS);
  setInterval(tickStressTest, STRESS_TEST_INTERVAL_MS);
}

main().catch((e) => {
  console.error("Scheduler crashed:", e);
  process.exit(1);
});
