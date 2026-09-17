# AI Support Lab

An AI-powered customer support workflow: an incoming email is categorized, scored for sentiment and urgency, answered with a drafted reply, and that reply is evaluated for quality — end to end, backed by Google Gemini behind a swappable provider interface.

**Live:** https://ai-support-lab.vercel.app (running the real Gemini provider)

> Independent project, built solo.

## Features

- **Email categorization** — classifies an email into one of six support categories with a confidence score and a one-line reason.
- **Sentiment & urgency detection** — flags tone (positive / neutral / negative) and urgency (low / medium / high).
- **AI reply generation** — drafts a support reply grounded in the detected sentiment and urgency.
- **Response evaluation** — scores a reply on six quality dimensions and checks it against a fixed risk taxonomy (unsupported promises, unverified fix claims, invented policies, ignored questions, inappropriate tone).
- **End-to-end pipeline** — chains all four steps into one workflow, using either a built-in sample ticket or your own custom email, with the generated reply left editable before evaluation.
- **Batch evaluation** — runs generation + evaluation over a fixed dataset and reports per-email and aggregate quality scores.

## Screenshots

| | |
|---|---|
| Home | ![Home page](docs/screenshots/home.png) |
| Pipeline — input & analysis | ![Pipeline input and analysis](docs/screenshots/pipeline-analysis.png) |
| Generated response & QA evaluation | ![Generated response and evaluation](docs/screenshots/generated-response-evaluation.png) |

## Architecture

Every AI call goes through one interface:

```ts
type AIProvider = {
  name: string;
  complete: (prompt: string) => Promise<string>;
};
```

`getProvider()` (`lib/ai/provider.ts`) selects an implementation from `AI_PROVIDER`:

- **`mock`** — deterministic keyword/heuristic logic, no API key required. Useful for offline demos.
- **`gemini`** — calls the real Gemini API via `@google/genai`, model `gemini-flash-lite-latest`, with automatic retry on transient `429`/`503` errors.

The prompt-building modules (`lib/ai/categorize.ts`, `sentiment.ts`, `generate.ts`, `evaluate.ts`) and the API routes never know which provider is active — swapping providers is a one-line environment variable change. Gemini is only ever called server-side; the API key is never sent to the browser.

Request flow: `page → API route (app/api/*) → lib/ai/*.ts (prompt + response validation) → provider (mock or gemini)`.

`/pipeline` chains all four capabilities client-side — categorize → sentiment → generate → evaluate — sequencing the same API routes the individual pages use, with the generated reply left editable before it's scored. It accepts either a built-in sample ticket or a custom email entered by the visitor (subject and body required, sender name optional); both run through the identical pipeline and API routes.

## Tech stack

- Next.js (App Router) + TypeScript
- Google Gemini (`@google/genai`), model `gemini-flash-lite-latest`
- Plain CSS, no UI framework
- Deployed on Vercel

## Evaluation methodology

Every generated reply is scored on six dimensions (1–10): tone & empathy, relevance, clarity, completeness, professionalism, and groundedness.

**Overall score** = mean of the six dimensions, computed in code rather than asked of the model — capped at 4.9 if a *critical* risk flag is present (an unsupported refund promise, an unverified fix claim, or an invented policy/fact), regardless of how the other dimensions score.

That cap is the key design decision: a reply that invents a refund or a policy is a "do not send" outcome even if it reads well. A plain average would let polished writing paper over a fabricated claim; the cap makes sure it can't.

**Aggregate score** (batch evaluation) = mean of `overallScore` across all successfully-evaluated emails. Failed API calls are excluded from the average, never counted as zero — a batch with failures reports fewer scored emails, not lower ones.

## Dataset

`lib/data/sample-emails.ts` — nine hand-authored support emails, shared by the interactive pages and the batch evaluator. They're written, not scraped, specifically to cover every sentiment (positive / neutral / negative), every urgency level (low / medium / high), and every support category the app classifies: a billing dispute, a bug report, a feature request, an angry repeat escalation, unprompted positive feedback, a refund request, a locked account, a neutral inquiry, and an urgent outage.

## Results

Real Gemini output from an actual local run (`eval-results/latest.json`, `runAt: 2026-09-17T16:48:25.973Z`):

```json
{
  "id": "bug-report",
  "sentiment": "Negative",
  "urgency": "High",
  "generatedReply": "Dear Customer,\n\nI am very sorry to hear that your team is currently blocked by this PDF upload issue. I understand how urgent this is for your workflow.\n\nI have escalated this matter to our technical team to investigate the failure you are experiencing in Chrome and Firefox. We are treating this with high priority and will follow up with you as soon as we have an update.\n\nThank you for your patience.\n\nSincerely,\nCustomer Support",
  "overallScore": 9.8,
  "riskFlags": []
}
```

The reply references specifics from the email (PDF uploads, Chrome/Firefox) that no static template could produce — genuine model output, not the mock (whose responses are always literally prefixed `"Mock provider: ..."`).

Across the full 9-email dataset, that run scored an aggregate overall of **7.11/10** — 9/9 emails succeeded; five replies were capped for making an unverified promise or claim, which the evaluator correctly flagged.

## Setup and environment variables

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | No (default `mock`) | `mock` for a zero-setup offline demo, or `gemini` for real model output. |
| `GEMINI_API_KEY` | Only if `AI_PROVIDER=gemini` | Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Read server-side only, never sent to the browser. |

## Batch evaluation

```bash
npm run evaluate:batch
```

Runs `generateReply()` + `evaluateReply()` — the same functions the API routes use — over every dataset email against the real Gemini provider, and writes a report to `eval-results/latest.json`.

- **Sequential and paced** — requests are never concurrent; the script waits between items (`EVAL_BATCH_REQUEST_DELAY_MS`, default 4500ms × 3 requests/item ≈ 13.5s) to stay under the Gemini free tier's 15 requests/minute limit.
- **Resumable** — already-successful items are skipped (no API call, no re-scoring) on every run; only missing or previously-failed items are retried. Cap how many new items a single run attempts with `EVAL_BATCH_LIMIT=1`.
- **No fabricated scores** — a failed generate/evaluate call is recorded as `status: "error"` with the failing stage, never averaged in as a fake score.
- The report includes per-email results (reply, six scores, overall score, risk flags, rationale) plus `successCount`, `failureCount`, `aggregateOverallScore`, and `aggregateDimensionScores`.

## Project structure

```
app/
  api/{categorize,sentiment,generate,evaluate}/   API routes (server-side only)
  {categorize,sentiment,generate,evaluate}/       Individual demo pages
  pipeline/                                        End-to-end workflow page
components/                                        Shared UI
lib/ai/provider.ts        Provider-agnostic AI layer (mock + gemini)
lib/ai/categorize.ts      Categorization: prompt + validation
lib/ai/sentiment.ts       Sentiment/urgency: prompt + validation
lib/ai/generate.ts        Reply generation: prompt + validation
lib/ai/evaluate.ts        Reply evaluation: prompt + validation + scoring
lib/ai/categories.ts, sentiment-labels.ts, score-dimensions.ts, risk-flags.ts
                           Fixed taxonomies shared by server and client code
lib/data/sample-emails.ts        The 9-email dataset
lib/data/sample-evaluations.ts   Good/poor reply pairs for the evaluate demo
lib/data/pipeline-samples.ts     Sample tickets for the pipeline demo
scripts/evaluate-batch.ts        Batch evaluation runner
eval-results/                    Generated batch reports (gitignored)
```

## Roadmap

| Capability | Status | Notes |
|---|---|---|
| Categorization | Done | Structured JSON output, validated against a fixed taxonomy |
| Sentiment & urgency | Done | Two independent signals from one prompt |
| Reply generation | Done | Grounded in detected sentiment/urgency context (not retrieval-based) |
| Response evaluation | Done | Six-dimension rubric + risk-flag taxonomy, code-computed overall score |
| Pipeline | Done | Client-side orchestration of all four steps |
| Gemini provider | Done | Real model wired in behind the existing interface; mock kept as fallback |
| Batch evaluation | Done | Resumable, quota-safe, aggregate scoring |
| Deployment | Done | Live on Vercel with `AI_PROVIDER=gemini` |

Possible extensions: a larger or rotating evaluation dataset, CI-triggered batch runs, and additional providers (e.g. OpenAI, Claude) behind the same `AIProvider` interface.
