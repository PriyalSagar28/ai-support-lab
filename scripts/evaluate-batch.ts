// Reproducible, quota-safe batch evaluation: for every sample email in
// lib/data/sample-emails.ts, generate a reply and evaluate it — both against
// the REAL Gemini provider, using the exact same lib/ai/generate.ts and
// lib/ai/evaluate.ts modules the interactive /generate and /evaluate API
// routes already use. No new scoring logic lives here; this script is only
// a runner + aggregator.
//
// Run with: npm run evaluate:batch
//
// Env vars:
//   EVAL_BATCH_REQUEST_DELAY_MS  Minimum spacing between individual Gemini
//                                requests, in ms. Default 4500ms. Each item
//                                makes ~3 requests (sentiment, generate,
//                                evaluate), so the delay between items is
//                                3x this value — default keeps steady-state
//                                throughput under ~13.3 req/min, safely
//                                below the free tier's 15 req/min cap.
//   EVAL_BATCH_LIMIT             If set, only attempts this many not-yet-
//                                successful dataset items this run (the
//                                rest are left untouched from the loaded
//                                baseline). Useful for smoke-testing.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sampleEmails, formatSampleEmail, type SampleEmail } from "../lib/data/sample-emails";
import { generateReply } from "../lib/ai/generate";
import { evaluateReply } from "../lib/ai/evaluate";
import { getProvider } from "../lib/ai/provider";
import { SCORE_DIMENSIONS, type ScoreDimension } from "../lib/ai/score-dimensions";
import type { Sentiment, Urgency } from "../lib/ai/sentiment-labels";
import type { RiskFlag, Scores } from "../lib/ai/evaluate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "eval-results");
const OUT_PATH = path.join(OUT_DIR, "latest.json");

// --- Load .env.local ourselves ----------------------------------------------
//
// Next.js loads .env.local automatically for `next dev`/`next build`, but a
// standalone script has no such mechanism. This reads the file (never
// prints it) and only fills in variables not already set in the real
// environment, mirroring how dotenv/Next.js precedence works — so a shell
// export still wins over the file. This never writes to .env.local.
function loadEnvLocal(): void {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Result types ------------------------------------------------------------

type SuccessResult = {
  id: string;
  subject: string;
  status: "ok";
  sentiment: Sentiment;
  urgency: Urgency;
  generatedReply: string;
  scores: Scores;
  overallScore: number;
  riskFlags: RiskFlag[];
  rationale: {
    strengths: string;
    improvements: string;
    topSuggestion: string;
  };
};

type ErrorResult = {
  id: string;
  subject: string;
  status: "error";
  stage: "generate" | "evaluate";
  error: string;
  // Preserved when generate succeeded but evaluate failed, so a partial
  // result isn't silently discarded.
  sentiment?: Sentiment;
  urgency?: Urgency;
  generatedReply?: string;
};

type ItemResult = SuccessResult | ErrorResult;

type BatchReport = {
  runAt: string;
  provider: string;
  datasetSize: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  // Mean of overallScore across successful items only. `null` when there
  // are no successes yet, since a mean of zero items is not a real score
  // and must never be reported as if it were one.
  aggregateOverallScore: number | null;
  // Mean of each dimension across successful items only — same "no fake
  // numbers from zero items" rule as aggregateOverallScore.
  aggregateDimensionScores: Record<ScoreDimension, number> | null;
  aggregateMethod: string;
  results: ItemResult[];
};

// --- Resume support ------------------------------------------------------

// Loads the canonical resume file if present. If it isn't (e.g. this is the
// first run since resume support was added), falls back to the newest
// pre-existing timestamped `batch-*.json` report so already-earned
// successful results are never silently discarded.
function loadBaselineReport(): BatchReport | null {
  const tryRead = (filePath: string): BatchReport | null => {
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as BatchReport;
    } catch {
      return null;
    }
  };

  if (existsSync(OUT_PATH)) {
    return tryRead(OUT_PATH);
  }

  if (!existsSync(OUT_DIR)) return null;
  const olderReports = readdirSync(OUT_DIR)
    .filter((f) => /^batch-.*\.json$/.test(f))
    .sort();
  const newest = olderReports.at(-1);
  return newest ? tryRead(path.join(OUT_DIR, newest)) : null;
}

// --- Core run ------------------------------------------------------------

async function evaluateOne(sample: SampleEmail): Promise<ItemResult> {
  const emailText = formatSampleEmail(sample);

  // Retries for transient 429/503 responses are handled once, centrally, by
  // lib/ai/provider.ts's geminiProvider — deliberately not duplicated here.
  let generated: Awaited<ReturnType<typeof generateReply>>;
  try {
    generated = await generateReply(emailText);
  } catch (error) {
    return {
      id: sample.id,
      subject: sample.subject,
      status: "error",
      stage: "generate",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const evaluation = await evaluateReply({
      email: emailText,
      reply: generated.reply,
      sentiment: generated.sentiment,
      urgency: generated.urgency,
    });

    return {
      id: sample.id,
      subject: sample.subject,
      status: "ok",
      sentiment: generated.sentiment,
      urgency: generated.urgency,
      generatedReply: generated.reply,
      scores: evaluation.scores,
      overallScore: evaluation.overallScore,
      riskFlags: evaluation.riskFlags,
      rationale: {
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        topSuggestion: evaluation.topSuggestion,
      },
    };
  } catch (error) {
    return {
      id: sample.id,
      subject: sample.subject,
      status: "error",
      stage: "evaluate",
      error: error instanceof Error ? error.message : String(error),
      sentiment: generated.sentiment,
      urgency: generated.urgency,
      generatedReply: generated.reply,
    };
  }
}

// Mean of overallScore across successful items only — the same aggregation
// principle lib/ai/evaluate.ts already uses for a single reply's six
// dimensions (a plain mean), just one level up: mean of means. Failed items
// contribute no score in either direction; they're surfaced separately via
// failureCount instead of being averaged in as 0 (which would fabricate a
// data point that was never actually scored).
function computeAggregate(results: ItemResult[]): {
  aggregateOverallScore: number | null;
  aggregateDimensionScores: Record<ScoreDimension, number> | null;
} {
  const successes = results.filter((r): r is SuccessResult => r.status === "ok");
  if (successes.length === 0) {
    return { aggregateOverallScore: null, aggregateDimensionScores: null };
  }

  const aggregateOverallScore =
    Math.round(
      (successes.reduce((sum, r) => sum + r.overallScore, 0) / successes.length) * 100
    ) / 100;

  const aggregateDimensionScores = {} as Record<ScoreDimension, number>;
  for (const dimension of SCORE_DIMENSIONS) {
    const mean = successes.reduce((sum, r) => sum + r.scores[dimension], 0) / successes.length;
    aggregateDimensionScores[dimension] = Math.round(mean * 100) / 100;
  }

  return { aggregateOverallScore, aggregateDimensionScores };
}

async function main() {
  loadEnvLocal();

  const provider = getProvider();
  if (provider.name !== "gemini") {
    console.error(
      `AI_PROVIDER is "${provider.name}", not "gemini". Set AI_PROVIDER=gemini and GEMINI_API_KEY in .env.local before running this script — batch evaluation requires the real provider, not the mock.`
    );
    process.exit(1);
  }

  const requestDelayMs = Number(process.env.EVAL_BATCH_REQUEST_DELAY_MS) || 4500;
  const requestsPerItem = 3; // sentiment -> generate -> evaluate
  const itemDelayMs = requestDelayMs * requestsPerItem;
  const limit = process.env.EVAL_BATCH_LIMIT ? Number(process.env.EVAL_BATCH_LIMIT) : undefined;

  const baseline = loadBaselineReport();
  const existingById = new Map<string, ItemResult>();
  if (baseline) {
    for (const result of baseline.results) existingById.set(result.id, result);
    console.log(
      `Resuming from existing report: ${existingById.size} previously-attempted item(s), ${
        [...existingById.values()].filter((r) => r.status === "ok").length
      } already successful.`
    );
  }

  console.log(`Running batch evaluation against provider: ${provider.name}`);
  console.log(`Dataset: lib/data/sample-emails.ts (${sampleEmails.length} emails)`);
  console.log(
    `Pacing: ${requestDelayMs}ms/request -> ${itemDelayMs}ms between processed items` +
      (limit !== undefined ? ` | limit: ${limit} item(s) this run` : "") +
      "\n"
  );

  const results: ItemResult[] = [];
  let processedThisRun = 0;
  let isFirstProcessedItem = true;

  for (const sample of sampleEmails) {
    const existing = existingById.get(sample.id);

    if (existing && existing.status === "ok") {
      results.push(existing);
      console.log(`- ${sample.id} ... skipped (already succeeded)`);
      continue;
    }

    if (limit !== undefined && processedThisRun >= limit) {
      // Out of scope for this run. Carry forward whatever we already had
      // (a prior failure, or nothing at all) rather than attempting it.
      if (existing) results.push(existing);
      console.log(`- ${sample.id} ... deferred (limit reached for this run)`);
      continue;
    }

    if (!isFirstProcessedItem) {
      await sleep(itemDelayMs);
    }
    isFirstProcessedItem = false;
    processedThisRun += 1;

    process.stdout.write(`- ${sample.id} ... `);
    const result = await evaluateOne(sample);
    results.push(result);
    console.log(
      result.status === "ok"
        ? `ok (overall ${result.overallScore}/10)`
        : `FAILED at ${result.stage}: ${result.error}`
    );
  }

  const { aggregateOverallScore, aggregateDimensionScores } = computeAggregate(results);
  const successCount = results.filter((r) => r.status === "ok").length;
  const failureCount = results.filter((r) => r.status === "error").length;
  const pendingCount = sampleEmails.length - results.length;

  const report: BatchReport = {
    runAt: new Date().toISOString(),
    provider: provider.name,
    datasetSize: sampleEmails.length,
    successCount,
    failureCount,
    pendingCount,
    aggregateOverallScore,
    aggregateDimensionScores,
    aggregateMethod:
      "aggregateOverallScore = mean of per-response overallScore across all successfully-evaluated emails accumulated so far (failures and not-yet-attempted items excluded, never counted as 0). aggregateDimensionScores = the same mean applied per dimension. overallScore itself is computed by lib/ai/evaluate.ts: mean of the six dimension scores, capped at 4.9 if a critical risk flag (unsupported refund promise, unverified fix claim, or invented policy/fact) is present.",
    results,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR);
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log("\n--- Summary ---");
  console.log(
    `Dataset: ${sampleEmails.length} | Succeeded: ${successCount} | Failed: ${failureCount} | Pending: ${pendingCount} | Processed this run: ${processedThisRun}`
  );
  console.log(
    `Aggregate overall score: ${aggregateOverallScore === null ? "N/A (no successful evaluations yet)" : `${aggregateOverallScore}/10`}`
  );
  console.log(`Full results written to: ${path.relative(REPO_ROOT, OUT_PATH)}`);
  if (pendingCount > 0 || failureCount > 0) {
    console.log("Re-run `npm run evaluate:batch` to retry failed/pending items — already-successful ones are skipped automatically.");
  }

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Batch evaluation crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
