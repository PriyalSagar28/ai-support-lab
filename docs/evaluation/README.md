# Evaluation evidence

Generated output from the two evaluation scripts, copied here unchanged so reviewers can inspect it. The working copies live in `eval-results/`, which is gitignored.

| File | Produced by | Run |
|---|---|---|
| `batch-latest.json` | `npm run evaluate:batch` | 2026-09-28 |
| `benchmark-latest.json` | `npm run benchmark:evaluator` | 2026-09-28 |

## batch-latest.json — end-to-end batch evaluation

Runs the full system on the 9 sample emails in `lib/data/sample-emails.ts`: support-scope check, knowledge retrieval, reply generation, then evaluation. For each email it records the generated reply, the six dimension scores, the overall score, any risk flags, and the evaluator's notes (strengths, improvements, top suggestion). The top of the file has the aggregate: the mean overall score and mean per-dimension scores across all successful emails, plus a description of how the overall score is computed.

Latest result: 9/9 succeeded, mean overall **8.36 / 10**, 8 *Ready to send*, 1 *Needs revision* (`neutral-inquiry` — see the main README).

The file does not record which knowledge chunks each reply was grounded in.

## benchmark-latest.json — evaluator benchmark

Tests the **evaluator only**. 12 hand-written cases, each with a fixed email, a fixed reply and frozen knowledge chunks, run 3 times each. For every case it records the per-run scores, flags and question statuses, and whether each check passed.

Latest result: 12/12 cases passed, 36/36 runs completed; 15/15 automatic checks, 47/47 instruction-based checks, 8/8 informational checks.

## How to read these results

- **Model-judged.** Every score comes from the evaluator, which uses the same Gemini model family as the generator. Nothing here was reviewed or scored by humans.
- **Small samples.** The batch covers 9 representative emails; the benchmark has roughly one case per failure mode.
- **The benchmark is a regression suite.** It shows the evaluator catches specific, known failure modes and doesn't flag good replies. It does not measure agreement with human reviewers.
- **Not accuracy.** Neither file is an independently verified measure of factual accuracy, reply quality, or production performance. A groundedness score of 10 means the evaluator found no unsupported claims, not that the reply was fact-checked.
- **Scores vary between runs.** Identical input varied by up to 2.0 points in the latest benchmark run.
- **Flag labels vary too.** A repeat benchmark run the same day scored 11/12: in one of BM-08's three runs the evaluator labeled the unverified fix claim as *Invented policy or fact*, still a critical flag with the same *Do not send* verdict, but not the exact flag the check requires. The published file is the 12/12 run; see the main README for details.
- **Calibration overlap.** BM-01, BM-07 and BM-11 were used to tune the scoring calibration, so they are not independent evidence.
