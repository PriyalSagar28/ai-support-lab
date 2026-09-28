// Evaluator benchmark runner: runs every case in lib/data/evaluator-benchmark.ts
// through lib/ai/evaluate.ts's evaluateReply() — and nothing else. No
// sentiment detection, generation, categorization or retrieval: each case
// supplies its own fixed sentiment/urgency and frozen knowledge chunks, so
// this measures the evaluator only. One Gemini request per case per run.
//
// Run with: npm run benchmark:evaluator
//
// Env vars:
//   BENCHMARK_RUNS              Times each case is evaluated. Default 3.
//                               Flag checks must hold on every run; all other
//                               checks on at least 2/3 of runs (rounded up).
//   BENCHMARK_REQUEST_DELAY_MS  Minimum spacing between Gemini requests, in
//                               ms. Default 4500 (same as evaluate-batch.ts,
//                               under the free tier's 15 req/min).
//   BENCHMARK_CASES             Optional comma-separated case ids to run
//                               (e.g. "BM-06,BM-07"). Default: all.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatorBenchmark,
  bandFor,
  type BenchmarkCase,
  type BenchmarkCheck,
  type CheckBacking,
  type CheckSeverity,
  type OverallBand,
} from "../lib/data/evaluator-benchmark";
import { evaluateReply, type EvaluateResult } from "../lib/ai/evaluate";
import { getProvider } from "../lib/ai/provider";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "eval-results");
const OUT_PATH = path.join(OUT_DIR, "benchmark-latest.json");

// Same approach as scripts/evaluate-batch.ts: read .env.local (never print
// it) and only fill variables not already set in the real environment.
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

// --- Result types --------------------------------------------------------------

type RunResult =
  | { run: number; status: "ok"; overallScore: number; band: OverallBand; evaluation: EvaluateResult }
  | { run: number; status: "error"; error: string };

type CheckResult = {
  description: string;
  backing: CheckBacking;
  severity: CheckSeverity;
  why: string;
  passedRuns: number;
  requiredRuns: number;
  passed: boolean;
};

type CaseResult = {
  id: string;
  failureMode: string;
  expectedSummary: string;
  status: "pass" | "fail" | "error";
  overallScores: (number | null)[];
  checks: CheckResult[];
  runs: RunResult[];
};

type BenchmarkReport = {
  runAt: string;
  provider: string;
  runsPerCase: number;
  passRule: string;
  backingLegend: Record<CheckBacking, string>;
  summary: {
    cases: number;
    passed: number;
    failed: number;
    errored: number;
    mustChecks: Record<CheckBacking, { passed: number; total: number }>;
    idealChecks: { passed: number; total: number };
  };
  cases: CaseResult[];
};

// --- Checks ------------------------------------------------------------------

function describeCheck(check: BenchmarkCheck): string {
  switch (check.kind) {
    case "overallMin":
      return `overall >= ${check.value}`;
    case "overallMax":
      return `overall <= ${check.value}`;
    case "band":
      return `band in [${check.allowed.join(" | ")}]`;
    case "flagPresent":
      return `flag present: ${check.flag}`;
    case "anyFlagPresent":
      return `any flag present: ${check.flags.join(" | ")}`;
    case "flagsAbsent":
      return `flags absent: ${check.flags.join(", ")}`;
    case "dimensionMin":
      return `${check.dimension} >= ${check.value}`;
    case "dimensionMax":
      return `${check.dimension} <= ${check.value}`;
    case "questionStatusIncludes":
      return `some question is ${check.statuses.join(" or ")}`;
    case "questionStatusExcludes":
      return `no question is ${check.statuses.join(" or ")}`;
  }
}

function checkPasses(check: BenchmarkCheck, result: EvaluateResult): boolean {
  const flagTypes = result.riskFlags.map((f) => f.type);
  const statuses = result.customerQuestions.map((q) => q.status);
  switch (check.kind) {
    case "overallMin":
      return result.overallScore >= check.value;
    case "overallMax":
      return result.overallScore <= check.value;
    case "band":
      return check.allowed.includes(bandFor(result.overallScore));
    case "flagPresent":
      return flagTypes.includes(check.flag);
    case "anyFlagPresent":
      return check.flags.some((f) => flagTypes.includes(f));
    case "flagsAbsent":
      return !check.flags.some((f) => flagTypes.includes(f));
    case "dimensionMin":
      return result.scores[check.dimension] >= check.value;
    case "dimensionMax":
      return result.scores[check.dimension] <= check.value;
    case "questionStatusIncludes":
      return statuses.some((s) => check.statuses.includes(s));
    case "questionStatusExcludes":
      return !statuses.some((s) => check.statuses.includes(s));
  }
}

function isFlagCheck(check: BenchmarkCheck): boolean {
  return check.kind === "flagPresent" || check.kind === "anyFlagPresent" || check.kind === "flagsAbsent";
}

// Flags are discrete decisions and must be stable on every run; scores
// carry sampling noise, so they need a 2/3 majority. Errored runs count as
// failures for every check.
function requiredRunsFor(check: BenchmarkCheck, runsPerCase: number): number {
  return isFlagCheck(check) ? runsPerCase : Math.ceil((runsPerCase * 2) / 3);
}

function scoreCase(benchmarkCase: BenchmarkCase, runs: RunResult[], runsPerCase: number): CaseResult {
  const okRuns = runs.filter((r): r is Extract<RunResult, { status: "ok" }> => r.status === "ok");

  const checks: CheckResult[] = benchmarkCase.checks.map((check) => {
    const passedRuns = okRuns.filter((r) => checkPasses(check, r.evaluation)).length;
    const requiredRuns = requiredRunsFor(check, runsPerCase);
    return {
      description: describeCheck(check),
      backing: check.backing,
      severity: check.severity,
      why: check.why,
      passedRuns,
      requiredRuns,
      passed: passedRuns >= requiredRuns,
    };
  });

  const status: CaseResult["status"] =
    okRuns.length === 0
      ? "error"
      : checks.every((c) => c.severity === "ideal" || c.passed)
        ? "pass"
        : "fail";

  return {
    id: benchmarkCase.id,
    failureMode: benchmarkCase.failureMode,
    expectedSummary: benchmarkCase.expectedSummary,
    status,
    overallScores: runs.map((r) => (r.status === "ok" ? r.overallScore : null)),
    checks,
    runs,
  };
}

// --- Main --------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const provider = getProvider();
  if (provider.name !== "gemini") {
    console.error(
      `AI_PROVIDER is "${provider.name}", not "gemini". Set AI_PROVIDER=gemini and GEMINI_API_KEY in .env.local before running this script — the benchmark measures the real evaluator, not the mock.`
    );
    process.exit(1);
  }

  const runsPerCase = Math.max(1, Math.floor(Number(process.env.BENCHMARK_RUNS) || 3));
  const requestDelayMs = Number(process.env.BENCHMARK_REQUEST_DELAY_MS) || 4500;
  const caseFilter = process.env.BENCHMARK_CASES?.split(",").map((s) => s.trim()).filter(Boolean);

  const cases = caseFilter?.length
    ? evaluatorBenchmark.filter((c) => caseFilter.includes(c.id))
    : evaluatorBenchmark;
  if (cases.length === 0) {
    console.error(`No benchmark cases match BENCHMARK_CASES="${process.env.BENCHMARK_CASES}".`);
    process.exit(1);
  }

  console.log(`Running evaluator benchmark against provider: ${provider.name}`);
  console.log(
    `Cases: ${cases.length} | Runs per case: ${runsPerCase} | Requests: ${cases.length * runsPerCase} | Pacing: ${requestDelayMs}ms/request\n`
  );

  const caseResults: CaseResult[] = [];
  let isFirstRequest = true;

  for (const benchmarkCase of cases) {
    const runs: RunResult[] = [];
    process.stdout.write(`- ${benchmarkCase.id} (${benchmarkCase.failureMode}) ... `);

    for (let run = 1; run <= runsPerCase; run++) {
      if (!isFirstRequest) await sleep(requestDelayMs);
      isFirstRequest = false;

      // Retries for transient 429/503 are handled centrally by
      // lib/ai/provider.ts, same as the batch evaluator.
      try {
        const evaluation = await evaluateReply({
          email: benchmarkCase.email,
          reply: benchmarkCase.reply,
          sentiment: benchmarkCase.sentiment,
          urgency: benchmarkCase.urgency,
          retrievedChunks: benchmarkCase.retrievedChunks,
        });
        runs.push({
          run,
          status: "ok",
          overallScore: evaluation.overallScore,
          band: bandFor(evaluation.overallScore),
          evaluation,
        });
      } catch (error) {
        runs.push({ run, status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    }

    const result = scoreCase(benchmarkCase, runs, runsPerCase);
    caseResults.push(result);
    const scores = result.overallScores.map((s) => (s === null ? "ERR" : s.toFixed(1))).join(", ");
    console.log(`${result.status.toUpperCase()} [${scores}]`);
  }

  // --- Summary -------------------------------------------------------------

  const mustChecks: BenchmarkReport["summary"]["mustChecks"] = {
    code: { passed: 0, total: 0 },
    prompt: { passed: 0, total: 0 },
  };
  const idealChecks = { passed: 0, total: 0 };
  for (const c of caseResults.flatMap((r) => r.checks)) {
    const bucket = c.severity === "must" ? mustChecks[c.backing] : idealChecks;
    bucket.total += 1;
    if (c.passed) bucket.passed += 1;
  }

  const report: BenchmarkReport = {
    runAt: new Date().toISOString(),
    provider: provider.name,
    runsPerCase,
    passRule:
      "A case passes when every 'must' check passes. Flag checks must hold on every run; other checks on at least ceil(2/3 of runs). Errored runs count as failures. 'ideal' checks are reported but never fail a case.",
    backingLegend: {
      code: "Enforced deterministically by lib/ai/evaluate.ts once the model emits the upstream signal (flag or 'unanswered' status). Failure = model missed the signal, or a code regression.",
      prompt: "Depends only on the model following the prompt rubric. Failure = evaluator judgment problem.",
    },
    summary: {
      cases: caseResults.length,
      passed: caseResults.filter((r) => r.status === "pass").length,
      failed: caseResults.filter((r) => r.status === "fail").length,
      errored: caseResults.filter((r) => r.status === "error").length,
      mustChecks,
      idealChecks,
    },
    cases: caseResults,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR);
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log("\n--- Case results ---");
  for (const r of caseResults) {
    console.log(`${r.status.toUpperCase().padEnd(5)} ${r.id}  ${r.failureMode}`);
    if (r.status === "error") {
      for (const run of r.runs) if (run.status === "error") console.log(`        run ${run.run} error: ${run.error}`);
      continue;
    }
    for (const c of r.checks) {
      if (c.passed) continue;
      const tag = `${c.severity === "must" ? "FAILED" : "missed"} [${c.backing === "code" ? "code-backed" : "prompt-only"}${c.severity === "ideal" ? ", ideal" : ""}]`;
      console.log(`        ${tag} ${c.description} (${c.passedRuns}/${r.runs.length} runs, needs ${c.requiredRuns})`);
    }
  }

  const { summary } = report;
  console.log("\n--- Summary ---");
  console.log(`Cases: ${summary.cases} | Passed: ${summary.passed} | Failed: ${summary.failed} | Errored: ${summary.errored}`);
  console.log(`Code-backed must checks: ${mustChecks.code.passed}/${mustChecks.code.total} passed`);
  console.log(`Prompt-only must checks: ${mustChecks.prompt.passed}/${mustChecks.prompt.total} passed`);
  console.log(`Ideal checks (informational): ${idealChecks.passed}/${idealChecks.total} met`);
  console.log(`Full results written to: ${path.relative(REPO_ROOT, OUT_PATH)}`);

  if (summary.failed > 0 || summary.errored > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Evaluator benchmark crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
