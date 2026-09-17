# AI Support Lab

A learning project for building — not just reading about — the core AI capabilities
behind a customer-support product:

1. **Email categorization** — classify an incoming email into a support category.
2. **Sentiment analysis** — detect sentiment and urgency in the customer's tone.
3. **AI response generation** — draft a suggested reply grounded in past examples.
4. **Response evaluation** — score a generated reply and explain why (the hard part).
5. **End-to-end pipeline** — chain all four steps together.

> An independent personal learning project, not tied to any company or product.

## Why this exists

Each module above is deliberately kept small and independently understandable, so
every concept can be learned by building it, one working phase at a time, rather than
all at once.

## Tech stack

- **Next.js (App Router) + TypeScript** — one project, one deploy target (Vercel).
- **Plain CSS** (no UI framework) — keeps the focus on the AI logic, not styling.
- **Provider-agnostic AI layer** (`lib/ai/provider.ts`) — a mock provider for
  zero-setup demoing, and a real **Google Gemini** provider (`gemini-flash-lite-latest`
  via `@google/genai`) for actual model output, selected purely via the
  `AI_PROVIDER` environment variable with no page or API route code changes.

## Project status

- [x] Phase 0 — Project scaffold, UI shell, navigation, mock demo state
- [x] Phase 1 — Email categorization
- [x] Phase 2 — Sentiment analysis
- [x] Phase 3 — AI response generation
- [x] Phase 4 — Response evaluation
- [x] Phase 5 — End-to-end pipeline
- [x] Real Gemini provider wired in behind the same `AIProvider` interface (mock kept as the default fallback)
- [x] Reproducible batch evaluation script (`npm run evaluate:batch`) — quota-safe, resumable
- [ ] Phase 6 — Polish + deploy

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | No (defaults to `mock`) | `mock` — canned/heuristic placeholder results, no API key needed, fully demoable offline. `gemini` — routes every AI call to the real Google Gemini API instead. |
| `GEMINI_API_KEY` | Only when `AI_PROVIDER=gemini` | Your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Read server-side only (`lib/ai/provider.ts`), never sent to the browser, never logged. |

With `AI_PROVIDER` unset or `mock`, the whole UI works with zero configuration.
Set `AI_PROVIDER=gemini` plus `GEMINI_API_KEY` in `.env.local` to use the real
model everywhere (`/categorize`, `/sentiment`, `/generate`, `/evaluate`,
`/pipeline`, and `scripts/evaluate-batch.ts`) with no other code changes —
that's the whole point of the provider abstraction below.

## AI provider architecture

All AI calls go through one interface, defined in `lib/ai/provider.ts`:

```ts
type AIProvider = {
  name: string;
  complete: (prompt: string) => Promise<string>;
};
```

`getProvider()` picks an implementation based on `AI_PROVIDER`. Two are
registered:

- **`mock`** (default) — crude keyword/heuristic logic per capability (see the
  Phase notes below), useful for demoing the UI with no API key.
- **`gemini`** — calls the real Google Gemini API via the official
  `@google/genai` SDK, using model **`gemini-flash-lite-latest`** (chosen
  because the plain `gemini-flash-latest` alias was observed returning
  persistent `503` "high demand" errors on the free tier, while the lite
  variant stayed reliable — see the code comment in `provider.ts`). Transient
  `429`/`503` errors get up to two automatic retries with a short backoff
  before failing; anything else (missing key, bad request) fails immediately.

Both providers implement the exact same `complete(prompt): Promise<string>`
interface, so `lib/ai/categorize.ts`, `sentiment.ts`, `generate.ts`, and
`evaluate.ts` — and every API route and page that calls them — never know or
care which one is active. Real providers are always called **server-side
only** (API routes and `scripts/evaluate-batch.ts`) — no API key is ever sent
to the browser.

**Proof the real model is being used, not the mock:** the mock provider's
responses are literally labeled — e.g. a categorize `reason` always starts
with `"Mock provider: ..."`. With `AI_PROVIDER=gemini` set, that label never
appears; responses instead contain the model's own free-form reasoning (see
the real example in [Batch evaluation](#batch-evaluation) below, or run
`npm run dev` and call `/api/categorize` yourself to compare).

## Project structure

```
app/                          Pages
  api/categorize/              Phase 1 API route (server-side only)
  api/sentiment/                Phase 2 API route (server-side only)
  api/generate/                  Phase 3 API route (server-side only, also used by the pipeline)
  api/evaluate/                   Phase 4 API route (server-side only, also used by the pipeline)
  categorize/                  Phase 1 module page
  sentiment/                    Phase 2 module page
  generate/                       Phase 3 module page
  evaluate/                        Phase 4 module page
  pipeline/                      Phase 5: the full end-to-end workflow
components/                   Shared UI (nav, page header, email input, result card, pipeline callout)
lib/ai/provider.ts           Provider-agnostic AI layer (mock today, real later)
lib/ai/categories.ts         The fixed category taxonomy
lib/ai/categorize.ts         Phase 1: prompt building + response validation
lib/ai/sentiment-labels.ts   The fixed sentiment/urgency labels
lib/ai/sentiment.ts          Phase 2: prompt building + response validation
lib/ai/generate.ts           Phase 3: prompt building + response validation
lib/ai/score-dimensions.ts   The fixed evaluation dimensions (pure, no provider import)
lib/ai/risk-flags.ts         The fixed risk-flag taxonomy (pure, no provider import)
lib/ai/evaluate.ts           Phase 4: prompt building + response validation + scoring
lib/data/                     Sample email dataset used across every demo page
lib/data/sample-evaluations.ts  Good/poor email+reply pairs for Phase 4
lib/data/pipeline-samples.ts    Five inbox-style scenarios for Phase 5
scripts/evaluate-batch.ts    Batch evaluation runner (real Gemini provider only)
eval-results/                Generated batch evaluation reports (gitignored)
```

## Phase 1 notes: email categorization

`lib/ai/categorize.ts` builds a prompt asking the active provider to return
`{category, confidence, reason}` as JSON, then validates the shape (category
must be one of the six fixed labels, confidence must be a number in `[0,1]`,
reason must be a non-empty string) before it's returned to the UI.

The mock provider answers this with simple keyword matching (see
`lib/ai/provider.ts`) — not real language understanding. That means some
realistic emails won't match any keyword and fall back to "Other" even
though a real LLM would classify them correctly; that gap is intentional and
is exactly what swapping in a real provider (via `AI_PROVIDER`) later fixes.
Confidence here is a heuristic score, not a calibrated probability — that
stays true even once a real model is wired in, since LLM-reported confidence
is self-assessed, not statistically calibrated.

## Phase 2 notes: sentiment analysis

`lib/ai/sentiment.ts` builds a prompt asking for `{sentiment, urgency,
confidence, explanation}` as JSON and validates all four fields, mirroring
the categorize module exactly.

The mock provider scores sentiment and urgency as two independent keyword
axes (see `lib/ai/provider.ts`) — an email can be urgent without sounding
negative, or vice versa. One deliberate fix worth noting: "not urgent" is
checked before "urgent", so a literal negation isn't misread as a high-
urgency signal just because the substring "urgent" appears inside it — a
classic keyword-heuristic pitfall a real model wouldn't have.

## Phase 3 notes: AI response generation

`lib/ai/generate.ts` first calls `analyzeSentiment()` from Phase 2 to get the
email's sentiment and urgency, then builds a reply prompt that tells the
model to match its tone to that context — reusing Phase 2 rather than
re-deriving tone from scratch. It validates that the model returned a
non-empty `{reply}` string before handing it back.

The mock provider answers with a small template keyed off the detected
sentiment/urgency (and the email's subject line, for a touch of grounding) —
it does not actually read or reason about the body of the email the way a
real model would. The UI always shows a disclaimer and renders the reply in
an editable textarea, regardless of provider, since an AI draft should never
be treated as final without a human review pass.

## Phase 4 notes: response evaluation

`lib/ai/evaluate.ts` scores a reply on six dimensions (tone & empathy,
relevance, clarity, completeness, professionalism, groundedness) plus a list
of risk flags from a fixed taxonomy (`lib/ai/risk-flags.ts`): unsupported
refund promise, unverified fix claim, invented policy or fact, ignored
question, inappropriate tone.

Two design choices worth calling out:

- **The overall score is computed by our code, not asked of the model.** We
  take the mean of the six dimension scores ourselves, and if a *critical*
  risk flag is present (an unsupported promise, an unverified fix claim, or
  an invented fact), the score is capped below 5 (at 4.9) regardless of how
  the other dimensions read — so a critically-flagged reply always reads as
  "do not send", never a borderline "needs revision". A single fabricated
  claim should tank a QA review even if the writing is polished — that's a
  judgment call our code makes deterministically, not something left to the
  model's own arithmetic.
- **The sample data (`lib/data/sample-evaluations.ts`) pairs a GOOD and a
  POOR reply to the *same* email** for three scenarios, so loading both
  shows exactly what the evaluator rewards or penalizes rather than
  comparing unrelated situations.

The mock provider (see `lib/ai/provider.ts`) scores heuristically: keyword
overlap between email and reply stands in for relevance, a handful of exact
trigger phrases ("have issued a refund", "our policy states", "you should
have"...) drive the risk flags, and the sample replies were written to
contain those phrases deliberately so the demo is reliable. A real model
would judge substance, not string matches.

**A client/server boundary lesson from this phase:** `lib/ai/score-dimensions.ts`
and `lib/ai/risk-flags.ts` exist as separate, import-free files specifically
so the `/evaluate` page can import their arrays as real runtime values (to
render the dimension grid and populate dropdowns) without pulling in
`lib/ai/provider.ts`. A `type`-only import is erased at compile time and is
always safe regardless of what it points to — but a *value* import drags in
that module's entire dependency chain. Since `lib/ai/evaluate.ts` imports
`getProvider` from `provider.ts`, importing a value from `evaluate.ts` into
a `"use client"` page would bundle `provider.ts` into the browser too. That's
harmless today (the mock has no secrets), but it's exactly the pattern that
would leak a real API key once one exists — so runtime values the UI needs
live in provider-free files, and anything that touches `provider.ts` is only
ever imported as a type from client code.

## Phase 5 notes: end-to-end pipeline

`/pipeline` chains the four modules into one workflow: an inbox-style ticket
→ category + confidence → sentiment + urgency → an editable generated reply
→ QA evaluation → a final "ready to send / needs revision / do not send"
recommendation, with a live step indicator showing progress through each
stage.

**No new AI logic was added for this phase.** The pipeline page calls the
exact same four API routes (`/api/categorize`, `/api/sentiment`,
`/api/generate`, `/api/evaluate`) that the individual module pages call —
it's purely a client-side orchestrator that sequences existing endpoints and
threads their outputs into the next call (e.g. the detected sentiment feeds
both the context display and the generate request). A dedicated
`/api/pipeline` endpoint was deliberately *not* built: since the reply must
stay editable before evaluation (a human-in-the-loop step, not something a
single atomic call should skip), and the UI needs to reveal each stage as it
completes rather than all at once, a thin client-side sequence over the
existing routes was the simpler and more honest architecture.

**The one small integration fix**, per the brief: `generateReply()` (Phase
3) and `POST /api/generate` now accept an *optional* precomputed
`{sentiment, urgency}`. When the pipeline calls it, it passes the sentiment
result it already has, skipping a second, redundant sentiment analysis call.
When the field is omitted — exactly what the standalone `/generate` page
still sends — the route falls back to computing sentiment internally, so
Phase 3's behavior is unchanged.

`lib/mock-demo.ts` (the Phase 0 placeholder used by the old, not-yet-wired
`/pipeline` stub) was deleted — every page now runs real API calls, so it
was the last remaining piece of Phase 0 scaffolding with nothing left to
stand in for.

## Batch evaluation

`scripts/evaluate-batch.ts` runs the real Gemini provider — not the mock —
end-to-end over a fixed dataset and produces a machine-readable quality
report, so the reply-generation + evaluation pipeline can be measured as a
whole rather than eyeballed one email at a time.

**Dataset and how it was built:** `lib/data/sample-emails.ts` — the same
nine emails used to seed the `/categorize`, `/sentiment`, and `/generate`
pages. No separate batch-only dataset exists; no dataset-generation script
was needed since this one is small and hand-authored. It's deliberately
*written*, not scraped or fetched, so every scenario is a known, deliberate
test case: one example each of a billing dispute, a bug report, a feature
request, an angry repeat-escalation, unprompted positive feedback, a refund
request, a locked account, a neutral factual inquiry, and an urgent outage —
chosen to spread across every sentiment (positive/neutral/negative) and
urgency (low/medium/high) combination the app is meant to detect, plus every
category in `lib/ai/categories.ts`. That spread is the point: a dataset of
only happy-path or only angry emails would hide how the model handles the
other end of the range.

**Run it:**

```bash
npm run evaluate:batch
```

Requires `AI_PROVIDER=gemini` and `GEMINI_API_KEY` already set in
`.env.local` (see [Environment variables](#environment-variables)) — the
script loads `.env.local` itself (that loading is normally a Next.js-only
convenience) and exits immediately with a clear message if the mock
provider is still active. It never prints the key. Works from a clean
`git clone` + `npm install` with no other setup.

**Pacing and quota safety:** processing is strictly sequential (never
concurrent) and paced to stay under the Gemini free tier's 15 requests/minute
limit. Each item makes ~3 calls (sentiment → generate → evaluate), so by
default the script waits `EVAL_BATCH_REQUEST_DELAY_MS` (4500ms) × 3 = 13.5s
between items — about 13.3 req/min, safely under the cap. Override with:

```bash
EVAL_BATCH_REQUEST_DELAY_MS=6000 npm run evaluate:batch
```

Transient `429`/`503` errors are retried automatically by the underlying
Gemini provider (`lib/ai/provider.ts`) — the batch script doesn't duplicate
that logic, it just paces requests so retries are rarely needed.

**Resume-friendly by design:** output is always written to the same file,
`eval-results/latest.json` (gitignored — generated, not source). Every run:

1. Loads `eval-results/latest.json` if it exists (or, the first time, falls
   back to the newest older `batch-*.json` archive, so no history is lost).
2. Skips any dataset item that's already `status: "ok"` — **no API call is
   made for it**, and its previously-earned result is carried into the new
   report byte-for-byte.
3. Retries only items that are missing or previously `status: "error"`.

To test on a small slice without spending the full quota, cap how many
not-yet-successful items a run attempts:

```bash
EVAL_BATCH_LIMIT=1 npm run evaluate:batch
```

Items beyond the limit are left exactly as they were (not touched, not
re-scored) — this is purely a "how many new attempts this run" knob, not a
dataset truncation.

**What it does, per email:** calls `generateReply()` (Phase 3) to draft a
reply, then `evaluateReply()` (Phase 4) to score that reply — the exact same
functions `/api/generate` and `/api/evaluate` call, so the batch script adds
no new AI logic of its own.

**Per-response result:** each dataset entry produces one of:

- `status: "ok"` — `sentiment`, `urgency`, `generatedReply`, `scores` (all
  six dimensions), `overallScore`, `riskFlags`, and a `rationale`
  (`strengths` / `improvements` / `topSuggestion`, taken directly from the
  evaluator's output).
- `status: "error"` — which `stage` failed (`generate` or `evaluate`) and
  the error message. **A failure is never scored.** If `generate` fails,
  there's no reply to evaluate, so the item is skipped entirely; if
  `evaluate` fails, the reply that was generated is still recorded (nothing
  useful is thrown away), but it carries no scores. This is why the batch
  script can't just silently retry-and-average its way past an error —
  doing so would report a made-up score for a response the model was never
  actually asked to judge.

**Aggregate score:** `aggregateOverallScore` is the mean of `overallScore`
across every successful response accumulated so far — across possibly
several resumed runs, not just the latest one — with failed or not-yet-
attempted items excluded from the average, never counted as 0 (see
`aggregateMethod` in the output for this stated explicitly). `overallScore`
itself is unchanged from Phase 4: the mean of the six dimension scores,
capped at 4.9 if a critical risk flag (unsupported refund promise,
unverified fix claim, or invented policy/fact) is present.
`aggregateDimensionScores` applies the same per-item-then-mean approach to
each of the six dimensions individually, so a low aggregate can be traced
back to which dimension is actually weak. The report also states
`successCount`, `failureCount`, and `pendingCount` (dataset items never yet
attempted) explicitly.

**Why a mean of per-response scores, capped by risk flags:** an email
support system fails a customer either gradually (mediocre tone, unclear
writing) or catastrophically (a confidently-invented refund promise or fake
policy). A plain average across many replies captures the gradual case; the
existing critical-risk-flag cap (inherited unchanged from Phase 4) ensures
one email where the model fabricates a commitment can't be diluted into
invisibility by several polished-but-unrelated replies in the same batch —
the aggregate stays honest about the worst failure mode, not just the
typical case. This matters specifically for support-email quality: a
generic "average tone score" would let one dangerous fabricated promise
hide inside an otherwise-good-looking batch, which is the exact failure a
QA process for customer-facing replies can't afford to miss.

**Output:** `eval-results/latest.json`, containing `runAt`, `provider`,
`datasetSize`, `successCount`/`failureCount`/`pendingCount`, both aggregate
scores, `aggregateMethod` as plain text, and the full per-response `results`
array. A summary also prints to the console, and the process exits non-zero
if any item currently has `status: "error"`, so a CI run or a wrapping
script can detect incomplete batches.

**Example — real Gemini output** (verbatim excerpt from an actual local run,
`runAt: "2026-09-17T16:48:25.973Z"`, not fabricated or hand-written for this
README):

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

Notice the reply directly references specifics from the email (PDF uploads,
Chrome/Firefox) that no template could know in advance — this is real model
output, not the mock (whose responses are always literally prefixed with
`"Mock provider: ..."`, see [AI provider architecture](#ai-provider-architecture)).

**Reproducing results:** re-running `npm run evaluate:batch` uses the same
dataset, prompts, and scoring logic every time, but the Gemini API itself is
not deterministic — expect scores to vary slightly (and occasionally a risk
flag to appear or disappear) on items that get freshly re-attempted, the
same way a human reviewer's judgment would. What's reproducible is the
*method*: same inputs, same prompts, same six-dimension rubric, same
capped-mean aggregation, same resume/skip behavior — not byte-identical
output on every single re-attempt.

## Roadmap

| Phase | Module | What it teaches |
|---|---|---|
| 0 | Scaffold | Project setup, UI shell, navigation, mock state |
| 1 | Categorize | Prompting for classification, structured output |
| 2 | Sentiment | Combining multiple signals, structured output |
| 3 | Generate | Grounding generation in a dataset (few-shot / RAG) |
| 4 | Evaluate | Building a scoring rubric / LLM-as-judge |
| 5 | Pipeline | Composing independent modules into one flow |
| 6 | Polish | Real deploy, env vars, final README |
