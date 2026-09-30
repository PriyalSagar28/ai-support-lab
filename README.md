# AI Support Lab

AI Support Lab is an end-to-end workflow for customer-support emails. It categorizes an email, detects sentiment and urgency, retrieves similar past emails with the replies that were sent, plus relevant knowledge-base articles, generates a grounded reply with Google Gemini, and evaluates the reply before it's sent.

**Live demo:** https://ai-support-lab.vercel.app

> Independent project, built solo.

## Features

- Categorizes an email into one of six support categories, with a confidence score and a reason
- Detects sentiment (positive / neutral / negative) and urgency (low / medium / high)
- Checks the email is actually about the product, then retrieves the most similar **past email → reply pairs** and the most relevant **knowledge-base excerpts** (RAG); the excerpts are shown in a **Knowledge used** card
- Generates a reply with Google Gemini: past replies show *how* to respond, the knowledge base supplies *what* facts to state
- Evaluates the reply on six quality dimensions against the same excerpts, and flags risky claims like unsupported promises or invented policies
- Runs the full pipeline end to end on one page — on a built-in sample email or one you write yourself. The reply is scored automatically, and can be edited and re-checked
- Includes a batch evaluation script and a 14-case evaluator benchmark

## Screenshots

| | |
|---|---|
| Pipeline — input & analysis | ![Pipeline input and analysis](docs/screenshots/pipeline-analysis.png) |
| Knowledge used — RAG retrieval | ![Knowledge used — RAG retrieval](docs/screenshots/knowledge-used.png) |
| Generated response & QA evaluation | ![Generated response and evaluation](docs/screenshots/generated-response-evaluation.png) |

## How it works

Every text-generation call goes through one interface:

```ts
type AIProvider = {
  name: string;
  complete: (prompt: string) => Promise<string>;
};
```

- `getProvider()` picks an implementation based on `AI_PROVIDER`: `mock` (keyword-based, no API key needed) or `gemini` (the real Google Gemini API via `@google/genai`, model `gemini-flash-lite-latest`, with automatic retries on transient 429/503 errors).
- The AI modules and API routes don't know which provider is active — switching is a one-line environment variable change.
- Gemini is only ever called server-side. The API key never reaches the browser.
- Request flow: page → API route → AI module (builds the prompt, validates the response) → provider.
- The pipeline chains **categorize → sentiment → scope check → retrieve past replies + knowledge → generate → evaluate**. The knowledge chunks retrieved for generation are passed unchanged to the evaluator, so groundedness is judged against exactly the facts the model saw.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Generation & evaluation | Google Gemini (`@google/genai`), model `gemini-flash-lite-latest` |
| Embeddings | Gemini `gemini-embedding-001` (768 dimensions) |
| Retrieval (RAG) | Cosine similarity over two committed JSON indexes (past replies, knowledge base) — no vector database |
| Styling | Plain CSS |
| Hosting | Vercel |

## How generation is grounded

Two retrievals run for every in-scope email, and each has a different job in the prompt:

| Source | Role in the prompt | Retrieved |
|---|---|---|
| **Past email → reply pairs** (`lib/data/past-email-replies.ts`) | Few-shot examples of **how** similar requests were answered: tone, structure, what to ask for, when to be upfront that something isn't possible. Explicitly labeled *not authoritative policy*. | Top **2** by cosine similarity, floor **0.60** |
| **Knowledge base** (`knowledge/*.md`) | The **source of truth** for company facts: refund rules, prices, plan limits, account and troubleshooting steps. | Top **3** chunks, floor **0.60** |

Gemini writes the final reply from both, the customer email, and the detected sentiment/urgency. The prompt tells it to adapt the examples to this customer rather than copy them, and to follow the knowledge base whenever an example and the KB disagree. The evaluator receives only the knowledge chunks, not the examples, so a company fact that appears only in a past reply still counts as unsupported.

**Past-reply retrieval.** The email side of each pair is embedded with the same `gemini-embedding-001` model (768 dimensions) into `lib/ai/knowledge/example-index.json`, which is committed; rebuild it with `npm run index:examples`. The incoming email is embedded at request time and compared by cosine similarity. The 0.60 floor was checked against this index: each of the 9 evaluation emails had a best match between 0.62 and 0.80, while off-topic queries (weather, Netflix/Spotify pricing) peaked at 0.58. An off-topic email written like a support request can still clear the floor (about 0.65 for a Netflix-plans email), so both searches run only after the scope guard passes the email; out-of-scope emails retrieve **zero** examples and **zero** chunks.

**Trade-offs.**

- **Retrieval + few-shot prompting instead of fine-tuning.** The dataset is 14 pairs, far too few to fine-tune on without overfitting. Fine-tuning would also bake facts and style into weights, so every policy change would mean retraining. With retrieval, adding or fixing an example is a one-line data edit plus a re-index. Each reply can also be traced to the examples and chunks it used, and the same approach works with any model behind the provider interface.
- **Separate examples and knowledge base instead of past replies alone.** Past replies are a good guide to style, but a poor source of facts: they go stale when policy changes and can carry one agent's mistakes. Keeping the knowledge base as the only authority, and judging groundedness against it, stops a copied example from introducing an unsupported claim.
- **Local JSON indexes instead of a vector database.** 14 examples and 32 chunks fit in memory, and a linear cosine scan takes microseconds. A vector database (Pinecone, Chroma, etc.) would add infrastructure and cost with no benefit at this size; it would become worthwhile with thousands of records.
- **Costs.** Each in-scope email makes one scope-check call plus two embedding calls before generation. Few-shot examples also make the prompt longer.

## Knowledge base (RAG)

- **Source:** 6 markdown documents in `knowledge/` (refunds, cancellation, billing, plans, account help, troubleshooting), split by section into **32 chunks**.
- **Index:** each chunk is embedded with Gemini `gemini-embedding-001` (**768 dimensions**) and stored in `lib/ai/knowledge/knowledge-index.json`, which is committed — no vector database needed. Rebuild it with `npm run index:knowledge` after editing `knowledge/`.
- **Scope guard:** before retrieval, one short model call (`lib/ai/support-scope.ts`) judges whether the customer's request is actually about our product. Similarity alone can't tell "Netflix's plans" from "our plans": "How much does Netflix Premium cost?" scores 0.61 against our plans document. Out-of-scope emails retrieve **zero** chunks, and the model is told to explain politely what support can help with, without applying our policies. If the scope check itself fails, it falls back to normal retrieval. It is skipped with the mock provider.
- **Retrieval:** the email is embedded at request time and ranked against the index by **cosine similarity**. Chunks scoring below **0.60** (configurable via `KNOWLEDGE_MIN_SIMILARITY`) are discarded, and the **top 3** of the rest go into the generation prompt. An email with nothing relevant can therefore retrieve no chunks; the model is then told no relevant knowledge was found and must not invent company-specific facts.
- **Evaluation:** the **same** chunks (up to 3, possibly none) are passed to the evaluator. A company-specific claim counts as grounded only if the email or those chunks support it.
- **UI and API:** the pipeline's **Knowledge used** card shows the retrieved sources and similarity scores. `POST /api/knowledge/search` with `{ "query": "..." }` (optional `topK`) returns ranked chunks directly.
- Embeddings need `GEMINI_API_KEY`; there is no mock embedding provider. In keyless mock mode, retrieval is skipped so the demo still runs. If retrieval fails with a key set, generation fails with a clear error rather than silently drafting an ungrounded reply.

## Evaluation

Each reply gets one evaluator call that works in a fixed order:

1. **Question-by-question analysis** — every distinct customer question/request is marked `answered`, `partly answered` or `unanswered`. Honestly saying an answer isn't documented and will be followed up counts as `partly answered`, not ignored.
2. **Claim-by-claim grounding check** — every company-specific claim in the reply (prices, plan features and limits, policies, timelines, procedures, actions taken) is listed with its support (`knowledge base`, `email` or `unsupported`) and the supporting words. Silence is not support: a claim about a topic neither source addresses, including a negative one like "there is no limit on X", is `unsupported`.
3. **Feedback** — strengths, improvements, and a top suggestion.
4. **Six dimension scores (1–10)** — tone & empathy, relevance, clarity, completeness, professionalism, groundedness — against an anchored rubric with hard limits (e.g. relevance ≤ 5 for a generic reply; groundedness ≤ 4 for an unsupported claim, ≤ 6 for a real policy applied incorrectly).
5. **Risk flags** from a fixed list.

The model's scores are then checked in code, and the overall score is computed in code — never asked of the model:

- **Consistency rules:** any `unanswered` question forces the *Ignored customer's question* flag and caps completeness (≤ 6 for one, ≤ 4 for two or more, ≤ 5 whenever that flag is present). Any `unsupported` company claim forces the *Invented policy or fact* flag (unless a fabrication flag is already present). Any critical flag caps groundedness at 4. The cited evidence is recorded for auditing but not string-matched against the sources: an exact-match check was tried and removed because the evaluator model paraphrases its quotes, which flagged genuinely supported claims.
- **Weighted average:** relevance 25%, groundedness 25%, completeness 20%, tone & empathy 10%, clarity 10%, professionalism 10%.
- **Weakest-dimension ceiling:** overall ≤ weakest dimension + 1.5, so strong writing can't hide one failing dimension.
- **Risk-flag caps:**

  | Severity | Flags | Overall capped at |
  |---|---|---|
  | Critical | Unsupported refund promise, Unverified fix claim, Invented policy or fact | 4.9 (*Do not send*) |
  | Major | Ignored customer's question, Inappropriate tone | 6.9 (never *Ready to send*) |

- **Overall** = the lowest of those three. Labels: ≥ 8 *Ready to send*, ≥ 5 *Needs revision*, otherwise *Do not send as-is*.

**Calibration.** 8 is the normal score for a correct, complete, well-written reply. A dimension reaches 9 only for a specific, observable strength beyond the basics (e.g. anticipating an obvious follow-up), and 10 is reserved for exceptional execution. Groundedness is scored on accuracy alone: 9–10 when every company claim is supported and correctly applied.

**Malformed output.** If the model returns output that breaks the expected JSON shape (e.g. an unknown question status), the evaluator retries the same request once. Invalid values are never coerced; if the retry is also invalid, the request fails as before. Provider/API errors don't trigger this retry.

The standalone `/evaluate` page scores a reply against the email only, since it has no retrieval step; the pipeline and batch script pass the retrieved chunks.

**Why this metric.** A support email has no single correct reply, so exact-match accuracy or text-overlap scores (BLEU/ROUGE against a reference) would penalize good replies that are worded differently. Instead, the six dimensions mirror what a support lead checks before a reply goes out: does it address *this* customer's issue (relevance), answer every question (completeness), stay true to company policy (groundedness), and read well (tone, clarity, professionalism). Relevance and groundedness carry the most weight because a wrong or invented answer does more damage than awkward wording. The code-level caps exist because an average hides critical failures — one invented refund promise should make a reply unsendable however polished the rest is. Per-question statuses and named risk flags make each score explainable, not just a number.

**How the metric was validated.** The [evaluator benchmark](#evaluator-benchmark) checks the rubric itself. It gives the evaluator fixed replies with known flaws (an invented policy, an ignored question, an unsupported promise, and so on) and known-good replies. It then checks that each flaw is caught and that good replies aren't flagged. The [batch evaluation](#current-batch-evaluation) then applies the validated evaluator to the whole system end to end. Both are model-judged and small, and neither has been compared against human reviewers, so treat them as evidence that the metric behaves sensibly, not as a measured agreement rate.

## Current batch evaluation

`npm run evaluate:batch` runs the **whole system** — scope check, retrieval, generation and evaluation — on the 9 sample emails (see [Datasets](#datasets)). This is different from the evaluator benchmark below, which tests only the evaluator on fixed replies.

**Important:** this batch was run **before** the claim-by-claim grounding check was added to the evaluator, and has not been re-run since. The scores below are therefore from the previous evaluator.

**Latest run** (2026-09-30, on the current system except the evaluator change above: scope guard → past email → reply retrieval + knowledge-base retrieval → Gemini generation → evaluator; full output in [`docs/evaluation/batch-latest.json`](docs/evaluation/batch-latest.json), which also records the examples and chunks each reply used):

| Emails evaluated | Mean overall | Ready to send | Needs revision | Do not send |
|---|---|---|---|---|
| 9/9 | **8.34 / 10** | 8 | 1 | 0 |

| Tone & empathy | Relevance | Clarity | Completeness | Professionalism | Groundedness |
|---|---|---|---|---|---|
| 8.33 | 8.00 | 8.00 | 7.56 | 8.00 | 9.56 |

| Email | Overall | Past-reply examples retrieved | Risk flags |
|---|---|---|---|
| billing-double-charge | 8.3 | refund-duplicate-charge, refund-outside-window | — |
| bug-report | 8.5 | bug-app-freezing, bug-automation-not-triggering | — |
| feature-request | 8.5 | other-positive-feedback, feature-request-export | — |
| angry-escalation | 8.9 | bug-inbox-sync-delay, bug-automation-not-triggering | — |
| positive-feedback | 8.5 | other-positive-feedback, bug-automation-not-triggering | — |
| refund-request | **6.4** | refund-outside-window, refund-duplicate-charge | Ignored customer's question |
| account-locked | 8.6 | account-sso-login, account-reset-email-missing | — |
| neutral-inquiry | 8.5 | other-undocumented-discount, bug-inbox-sync-delay | — |
| urgent-outage | 8.9 | bug-inbox-sync-delay, bug-automation-not-triggering | — |

An earlier run (2026-09-28) used knowledge-base grounding only. The architecture has changed since then, so the two runs aren't compared here.

**A failure the evaluator caught: `refund-request`.** The customer cancelled and was still charged. The knowledge base says such charges are refunded automatically within 5 business days. The reply quoted that rule correctly, but then asked for the account email and charge date "to verify" the refund. That contradicts the automatic process, and the reply never acknowledged the cancellation itself. The evaluator scored groundedness 6 (real policy applied incorrectly) and completeness 5, raised *Ignored customer's question*, and the caps produced **6.4** (*Needs revision*). Both retrieved examples also ask the customer for details, which may have encouraged this. That is plausible but not proven from one run.

**A failure the evaluator missed: `neutral-inquiry`.** The customer asks how many shared inboxes the team plan allows. The knowledge base doesn't document a shared-inbox limit. The reply stated that "our current subscription plans don't restrict the number of shared inboxes", which is an unsupported claim. It should have said the limit isn't documented, as the retrieved nonprofit-discount example shows. The previous evaluator scored groundedness 10 and raised no flag, so this **8.5 is a false pass**, not a correct answer. **Root cause:** groundedness was one holistic judgment, and the rubric only warned against flagging claims that *match* the knowledge base; nothing said that the knowledge base's silence is not support, so a plausible negative wrapped in accurate plan facts passed. **Fix:** the claim-by-claim grounding check above, plus benchmark cases BM-13/BM-14 for this failure mode on a different topic. Replaying this exact stored reply through the fixed evaluator gave 4.9 (*Invented policy or fact*, groundedness 4) on 3/3 runs, versus 8.5 on 3/3 with the old one. The full batch has not been re-run with the fixed evaluator.

**How to read these numbers.** They are model-judged: the evaluator uses the same Gemini model family as the generator, and no human reviewed the scores. As `neutral-inquiry` shows, a high groundedness score means the evaluator found no unsupported claims, not that the reply was independently fact-checked. With 9 emails and run-to-run variation of up to 2 points on identical input, this is a snapshot of the current system, not a measure of accuracy.

## Evaluator benchmark

`npm run benchmark:evaluator` tests the **evaluator itself** — not the generation model — using 14 hand-written cases (`lib/data/evaluator-benchmark.ts`).

- **Design:** 5 customer emails, each with several deliberately written replies, so score differences come from the reply alone. Each case fixes the sentiment/urgency and a **frozen** set of knowledge-base chunks, and calls only `evaluateReply()` — no generation or retrieval.
- **Coverage:** good grounded reply; grounded but incomplete; grounded but generic; ignored question; invented policy; real policy applied incorrectly; unsupported promise; inappropriate tone; missing customer info handled correctly; a correct refusal; a good reply to an angry escalation; a control with the same good reply but no retrieved context; a confident claim about a policy the knowledge base doesn't document (BM-13); and an honest "that isn't documented, I'll check" reply to the same email (BM-14).
- **Checks:** score ranges, labels, required/forbidden flags, per-dimension limits and question statuses. Each check is tagged *automatic* (guaranteed by code once the model raises the triggering signal) or *instruction-based* (depends on the model following the rubric). Flag checks must hold on every run; score checks on at least 2 of 3.

**Latest result** (2026-09-30, with the claim-by-claim grounding check, 3 runs per case; full output in [`docs/evaluation/benchmark-latest.json`](docs/evaluation/benchmark-latest.json)):

| Cases passed | Runs completed | Automatic checks | Instruction-based checks | Informational checks |
|---|---|---|---|---|
| 13/14 | 42/42 | 18/18 | 53/54 | 8/8 |

All 12 original cases pass, and BM-14 (honest "not documented" reply) passes with no false flags. **BM-13 fails** its strictest check: the unsupported "no cap" claim was flagged in 2 of 3 runs (4.9, *Do not send*), but in the third the evaluator cited evidence that only mentions automation rules, scored groundedness 7 and overall 7.7 (*Needs revision*, still not *Ready to send*). A separate 6-run sample of BM-13 caught it 6/6, so about 8 of 9 runs overall. With the previous evaluator, BM-13 scored 8.5 with groundedness 10 on 3/3 runs.

**What this is — and isn't.** It is a behavioral regression suite: it shows the evaluator catches each targeted failure mode and doesn't raise false alarms on good replies. It is **not** a statistical measure of agreement with human reviewers. Known limitations:

- A small, hand-written set by one author, with roughly one case per failure mode.
- The 8/9/10 calibration was tuned against BM-01, BM-07 and BM-11, so those three cases are no longer independent evidence.
- Scores vary between runs on identical input — up to 2.8 points in the published run (BM-13: 7.7, 4.9, 4.9) and 2.4 for BM-12 (4.9, 2.5, 2.5, all *Do not send*).
- The boundary between flawed and good replies is thin: in the published run the best flawed reply scored 7.7 (BM-13's missed run) and the weakest good reply 8.5.
- Detecting unsupported claims still depends on the model's judgment. The code enforces the consequences of an `unsupported` claim, but the model can still cite topic-only evidence as support, as in BM-13's missed run.
- The claim-check output is longer, and the lite evaluator model occasionally drops a required field. Two runs outside the published one errored ("Model did not return a top suggestion") even after the built-in retry.
- Flag labels can vary between runs. A repeat run on 2026-09-28 scored 11/12: in one of BM-08's three runs, the evaluator labeled the reply's unverified fix claim as *Invented policy or fact* instead of *Unverified fix claim*. The critical failure was still caught in all 3 runs — overall score (2.5), verdict (*Do not send*) and groundedness (1) were unchanged — but the check requires the exact flag on every run.
- The evaluator is occasionally inconsistent about whether an agent's own follow-up commitment ("I'll check back by end of day") is an unsupported claim, and sometimes raises *Ignored customer's question* when no question is marked `unanswered`.

## Datasets

**Past emails paired with replies (grounding dataset).** `lib/data/past-email-replies.ts` holds 14 email → reply pairs, each with an `id`, `category`, `email` and `response`. They cover every category the app classifies:

- **Billing:** upgrade proration, a failed payment, what happens on cancellation
- **Refund:** a duplicate charge, a request outside the 14-day window
- **Account Issue:** a missing reset email, lost 2FA, SSO login
- **Bug/Technical Issue:** an automation rule not firing, the app freezing, inbox sync
- **Feature Request:** CSV export
- **Other:** an undocumented nonprofit-discount question, positive feedback

*Origin:* **synthetic and hand-authored** for this project (with AI assistance; see [AI tools used](#ai-tools-used)). These are **not** real customer emails, and the replies were never actually sent. No real support history was available, so each pair was written as a representative example of a common support situation. Each reply was written to agree with `knowledge/*.md`, and they model the behavior the app aims for: answer the actual question, apply policy to the customer's case, ask for missing details, and say so honestly when something isn't documented. *Representativeness:* the pairs reflect one author's view of typical SaaS-support traffic, not a sampled distribution of real tickets. The set is small (14 pairs), clean and single-turn. Real inboxes contain threads, typos, mixed intents and inconsistent agent replies. The pairs are committed as code, so no fetch or generation step is needed.

The pairs are deliberately **distinct from the 9 evaluation emails** below, which have no paired replies. This way, the batch evaluation never retrieves an answer to its own test email.

**Evaluation emails (test set).** `lib/data/sample-emails.ts` has nine hand-written support emails: a billing dispute, a bug report, a feature request, an angry escalation, positive feedback, a refund request, a locked account, a general inquiry, and an outage. Together they cover every sentiment, every urgency level, and every category the app classifies.

**How it was built.** The emails are synthetic, written by hand rather than taken from real customers, so the repo contains no personal data. Each one targets a distinct support scenario, together spanning the category, sentiment and urgency labels. Several touch topics the knowledge base covers (refunds, billing, account access), so retrieval is exercised. One, `neutral-inquiry`, asks about something the knowledge base doesn't document. Each record is just `id`, `subject` and `body`. There are no gold labels or reference replies: the dataset is scored by the evaluator (above), not compared against expected answers. It is committed as code, so no fetch or generation step is needed.

The batch evaluator and the standalone pages use this dataset; the pipeline page has 5 sample tickets of its own (`lib/data/pipeline-samples.ts`), and the benchmark has its own 14 cases (above).

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

| Variable | Required | What it does |
|---|---|---|
| `AI_PROVIDER` | No (defaults to `mock`) | `mock` runs with no API key. `gemini` uses the real model. |
| `GEMINI_API_KEY` | For `gemini`, retrieval, and the scripts below | Your key from [Google AI Studio](https://aistudio.google.com/apikey). Used server-side only; keep it in `.env.local`, which is gitignored. |
| `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS` | No | Override the embedding model (default `gemini-embedding-001`) and size (default `768`). Rebuild the index if you change them. |
| `KNOWLEDGE_MIN_SIMILARITY` | No | Minimum cosine similarity (0–1) for a chunk to be used. Default `0.6`. |
| `EXAMPLES_MIN_SIMILARITY` | No | Minimum cosine similarity (0–1) for a past email → reply example to be used. Default `0.6`. |
| `DEBUG_SUPPORT_SCOPE` | No | Set to log the scope-guard decision server-side in production. It is always logged in development. |

## Scripts

```bash
npm test                     # offline unit tests (no API key needed)
npm run test:live            # live scope-guard + knowledge/example retrieval checks against Gemini
npm run lint                 # ESLint
npm run build                # production build
npm run index:knowledge      # re-embed knowledge/*.md into lib/ai/knowledge/knowledge-index.json
npm run index:examples       # re-embed the past email → reply pairs into lib/ai/knowledge/example-index.json
npm run evaluate:batch       # generate + evaluate every sample email with real Gemini
npm run benchmark:evaluator  # run the 14-case evaluator benchmark
```

Everything except `npm test` calls the real Gemini API and reads `.env.local` itself. `npm run test:live` makes one scope call per case plus two embedding calls per in-scope case — no reply generation.

**Batch evaluation** writes `eval-results/latest.json`: per-email replies, the retrieved example and chunk ids, scores, risk flags and rationale, plus an aggregate (the mean `overallScore` of successful items — failures are recorded as errors, never as zero). Requests are paced for the free tier (`EVAL_BATCH_REQUEST_DELAY_MS`, default 4500ms); re-runs skip emails that already succeeded, and `EVAL_BATCH_LIMIT` caps new attempts per run. To start a fresh run, move `eval-results/latest.json` and any `eval-results/batch-*.json` out of the folder first.

**Evaluator benchmark** writes `eval-results/benchmark-latest.json` and prints a pass/fail summary. Options:

- `BENCHMARK_RUNS` — runs per case (default `3`).
- `BENCHMARK_CASES` — comma-separated case IDs to run only those, e.g. `BM-01,BM-06` (default: all).
- `BENCHMARK_REQUEST_DELAY_MS` — spacing between Gemini requests (default `4500`).

A full run is 36 requests (~3 minutes). `eval-results/` is gitignored; the latest reports are copied to `docs/evaluation/` for review.

## Project structure

```
app/
  api/{categorize,sentiment,generate,evaluate}/   API routes (server-side only)
  api/knowledge/search/                            Knowledge search endpoint
  pipeline/                                        Support workspace — the main UI (/ redirects here)
  {categorize,sentiment,generate,evaluate}/        Standalone single-step pages (not in the nav)
components/                                        Shared UI
knowledge/                                         Knowledge-base source documents (markdown)
lib/ai/provider.ts        The mock + Gemini provider layer
lib/ai/categorize.ts      Categorization prompt + validation
lib/ai/sentiment.ts       Sentiment/urgency prompt + validation
lib/ai/support-scope.ts   Scope guard: is the email about our product?
lib/ai/generate.ts        Scope check + retrieval (past replies + knowledge) + grounded reply generation
lib/ai/evaluate.ts        Evaluation prompt + validation + scoring
lib/ai/knowledge/         Chunking, embeddings, retrieval, and the committed indexes
                           (knowledge-index.json, example-index.json, retrieve-examples.ts)
lib/ai/categories.ts, sentiment-labels.ts, score-dimensions.ts, risk-flags.ts
                           Fixed lists shared by server and client code
lib/data/past-email-replies.ts   The 14 past email → reply pairs (grounding dataset)
lib/data/sample-emails.ts        The 9-email evaluation set
lib/data/sample-evaluations.ts   Good/poor reply pairs for the evaluate demo
lib/data/pipeline-samples.ts     Sample tickets for the pipeline demo
lib/data/evaluator-benchmark.ts  The 14 evaluator benchmark cases
scripts/index-knowledge.ts       Builds the knowledge index
scripts/index-examples.ts        Builds the past-reply example index
scripts/evaluate-batch.ts        Batch evaluation runner
scripts/benchmark-evaluator.ts   Evaluator benchmark runner
tests/unit/support-scope.test.ts Offline tests for the scope guard, retrieval gate and prompt sections
tests/live/support-scope.test.ts Live scope-guard + knowledge/example retrieval checks (Gemini)
docs/evaluation/                 Latest batch + benchmark reports, for reviewers
eval-results/                    Generated reports (gitignored)
```

## Roadmap

| Capability | Status | Notes |
|---|---|---|
| Categorization | Done | Structured JSON output, fixed category list |
| Sentiment & urgency | Done | Two signals from one prompt |
| Knowledge base (RAG) | Done | 6 docs / 32 chunks, Gemini embeddings, cosine similarity with a 0.60 floor, top 3; scope guard blocks retrieval for out-of-scope emails |
| Past-reply grounding | Done | 14 synthetic email → reply pairs, top 2 by cosine similarity (0.60 floor), used as few-shot examples |
| Reply generation | Done | Grounded in retrieved past replies (style) and knowledge (facts) plus sentiment/urgency |
| Response evaluation | Done | Six-dimension rubric, risk flags, weighted score with caps computed in code |
| Evaluator benchmark | Done | 14 cases, 3 runs each, 13/14 passing (BM-13 caught 2/3 runs) |
| Pipeline | Done | One-page support workspace: sample or custom email, all steps chained together |
| Gemini provider | Done | Real model wired in; mock kept as a fallback |
| Batch evaluation | Done | Resumable, paced, aggregate scoring; latest run 9/9, mean 8.34, run before the evaluator's claim check was added; one known false pass under that evaluator |
| Deployment | Done | Live on Vercel with `AI_PROVIDER=gemini` |

Possible next steps: a larger, independently labelled benchmark to measure agreement with human reviewers, CI-triggered benchmark runs, and support for other providers behind the same interface.

## AI tools used

- **Google Gemini** (`gemini-flash-lite-latest`, `gemini-embedding-001`) is part of the product: it runs categorization, sentiment, the scope check, embeddings, reply generation and evaluation.
- **Claude Code** (Anthropic) was used as a coding assistant throughout development. It helped write and refactor code, draft the synthetic datasets and documentation, run tests, and audit the repo. Its output was reviewed and directed by the author.
