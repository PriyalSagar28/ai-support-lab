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
- **Provider-agnostic AI layer** (`lib/ai/provider.ts`) — starts with a mock provider
  today, swappable for a real one later purely via an environment variable.

## Project status

- [x] Phase 0 — Project scaffold, UI shell, navigation, mock demo state
- [x] Phase 1 — Email categorization
- [x] Phase 2 — Sentiment analysis
- [x] Phase 3 — AI response generation
- [x] Phase 4 — Response evaluation
- [x] Phase 5 — End-to-end pipeline
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

`AI_PROVIDER` controls which AI provider is used. Only `mock` exists today — it
returns canned/randomized placeholder results, so the whole UI is demoable without
any API key. Real providers will be added in later phases behind the same interface,
so no page code will need to change when that happens.

## AI provider architecture

All AI calls go through one interface, defined in `lib/ai/provider.ts`:

```ts
type AIProvider = {
  name: string;
  complete: (prompt: string) => Promise<string>;
};
```

`getProvider()` picks an implementation based on `AI_PROVIDER`. Today only `mock` is
registered. Real providers will always be called **server-side only** (API routes) —
no API key will ever be sent to the browser.

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
