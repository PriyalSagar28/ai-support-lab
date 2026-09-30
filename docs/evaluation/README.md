# Evaluation evidence

Generated output from the two evaluation scripts, copied here unchanged so reviewers can inspect it. The working copies live in `eval-results/`, which is gitignored.

| File | Produced by | Run |
|---|---|---|
| `batch-latest.json` | `npm run evaluate:batch` | 2026-09-30 |
| `benchmark-latest.json` | `npm run benchmark:evaluator` | 2026-09-30 |

## batch-latest.json — end-to-end batch evaluation

Runs the full current system on the 9 sample emails in `lib/data/sample-emails.ts`: support-scope check, retrieval of similar past email → reply examples and knowledge-base chunks, reply generation, then evaluation. For each email it records the retrieved examples and chunks (with similarity scores), the generated reply, the six dimension scores, the overall score, any risk flags, and the evaluator's notes (strengths, improvements, top suggestion). The top of the file has the aggregate: the mean overall score and mean per-dimension scores across all successful emails, plus a description of how the overall score is computed.

Latest result: 9/9 succeeded, mean overall **8.34 / 10**, 8 *Ready to send*, 1 *Needs revision* (`refund-request`). **This run predates the evaluator's claim-by-claim grounding check and has not been re-run with it.** Under that earlier evaluator, one *Ready to send* score is a known false pass: `neutral-inquiry` (8.5) states an undocumented "no shared-inbox limit" that went unflagged. Replaying that exact reply through the fixed evaluator gives 4.9 (*Invented policy or fact*) on 3/3 runs. See the main README.

## benchmark-latest.json — evaluator benchmark

Tests the **evaluator only**. 14 hand-written cases, each with a fixed email, a fixed reply and frozen knowledge chunks, run 3 times each. For every case it records the per-run scores, flags and question statuses, and whether each check passed.

Latest result: 13/14 cases passed, 42/42 runs completed; 18/18 automatic checks, 53/54 instruction-based checks, 8/8 informational checks. The failing case is BM-13 (a confident claim about an undocumented policy): flagged in 2 of 3 runs, while the third scored 7.7 (*Needs revision*) without the flag. Each evaluation now also records `companyClaims`: each claim, its support, and the cited evidence.

## How to read these results

- **Model-judged.** Every score comes from the evaluator, which uses the same Gemini model family as the generator. Nothing here was reviewed or scored by humans.
- **Small samples.** The batch covers 9 representative emails; the benchmark has roughly one case per failure mode.
- **The benchmark is a regression suite.** It shows the evaluator catches specific, known failure modes and doesn't flag good replies. It does not measure agreement with human reviewers.
- **Not accuracy.** Neither file is an independently verified measure of factual accuracy, reply quality, or production performance. A groundedness score of 10 means the evaluator found no unsupported claims, not that the reply was fact-checked — `neutral-inquiry` in the published batch scored 10 despite an unsupported claim.
- **Scores vary between runs.** Identical input varied by up to 2.8 points in the latest benchmark run.
- **Flag labels vary too.** An earlier 12-case run scored 11/12 because one BM-08 run used a different critical flag label; see the main README for details.
- **Calibration overlap.** BM-01, BM-07 and BM-11 were used to tune the scoring calibration, so they are not independent evidence.
