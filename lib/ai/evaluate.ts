// Phase 4: AI response evaluation (QA-style).
//
// Evaluates a support reply against the original email, the sentiment/
// urgency context it was written for, and — since RAG grounding was added
// to generation (lib/ai/generate.ts) — the SAME retrieved knowledge base
// chunks the reply was drafted from. Grounding is judged against email +
// knowledge base together, not email alone, so a reply correctly citing a
// real policy from the knowledge base isn't mistaken for a fabrication.
// The model first lists each distinct customer question/request and whether
// the reply answered it, then gives feedback, then scores six dimensions
// (1-10) against an anchored rubric, then flags specific risky behaviors
// (unsupported promises, invented facts, ignored questions, inappropriate
// tone). We then enforce the rubric's hard limits in code so scores, flags
// and the question analysis can't contradict each other, and derive the
// overall score ourselves: a weighted average, held down by the weakest
// dimension and capped by the most severe risk flag.

import { getProvider } from "./provider";
import type { Sentiment, Urgency } from "./sentiment-labels";
import { SCORE_DIMENSIONS, DIMENSION_DESCRIPTIONS, type ScoreDimension } from "./score-dimensions";
import {
  RISK_FLAG_TYPES,
  CRITICAL_RISK_FLAG_TYPES,
  MAJOR_RISK_FLAG_TYPES,
  type RiskFlagType,
} from "./risk-flags";
import { formatKnowledgeContext } from "./knowledge/format";
import type { RetrievedChunk } from "./knowledge/types";

export type Scores = Record<ScoreDimension, number>;

export type RiskFlag = {
  type: RiskFlagType;
  explanation: string;
};

export const ANSWER_STATUSES = ["answered", "partly answered", "unanswered"] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

// One distinct question or explicit request from the customer email, and
// whether the reply dealt with it. Produced BEFORE scores so the scores are
// reasoned from it rather than rationalized after the fact.
export type CustomerQuestion = {
  question: string;
  status: AnswerStatus;
};

export type EvaluateInput = {
  email: string;
  reply: string;
  sentiment: Sentiment;
  urgency: Urgency;
  // The SAME chunks generateReply() retrieved and gave to the model when it
  // drafted `reply` — not re-retrieved here. Optional (defaults to none) so
  // a caller that genuinely has no retrieval context still gets a valid,
  // if email-only-grounded, evaluation instead of an error.
  retrievedChunks?: RetrievedChunk[];
};

export type EvaluateResult = {
  customerQuestions: CustomerQuestion[];
  scores: Scores;
  overallScore: number;
  strengths: string;
  improvements: string;
  topSuggestion: string;
  riskFlags: RiskFlag[];
};

function buildPrompt({ email, reply, sentiment, urgency, retrievedChunks = [] }: EvaluateInput): string {
  return `You are a QA reviewer scoring a customer support reply before it is sent.

Customer email:
"""
${email.trim()}
"""

Detected customer sentiment: ${sentiment}
Detected urgency: ${urgency}

Relevant knowledge base excerpts (retrieved and available to the agent when this reply was drafted):
${formatKnowledgeContext(retrievedChunks)}
end of knowledge base excerpts

Proposed reply:
"""
${reply.trim()}
"""

The customer email AND the knowledge base excerpts above are, together, the complete source of truth available for this reply. A specific company fact in the reply (a policy, price, refund rule, timeline, or procedure) is GROUNDED if it is supported by the email OR by the knowledge base excerpts — it does not need to appear in the email itself to be valid. Only treat a company-specific claim as ungrounded if it is not supported by either source.

Work through the review in this order — each step informs the next, and your scores MUST be consistent with your analysis:
1. customerQuestions: list every distinct question or explicit request in the customer email. For each, mark whether the reply "answered", "partly answered", or left it "unanswered".
2. strengths: what the reply did well.
3. improvements: what should be improved.
4. topSuggestion: the single most important change.
5. scores: score each dimension using the scale and hard limits below.
6. riskFlags: report any risk flags that apply.

Dimensions:
${SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join("\n")}

Scoring scale (1-10), used for every dimension:
- 10 = Exemplary; essentially no meaningful improvement remains, and the reply handles this customer's specific situation unusually well — not just correctly. Use rarely.
- 9 = Clearly excellent; specific, observable strengths beyond being correct, grounded, concise, and professional.
- 8 = Good; a strong reply that is sendable as-is. This is the normal score for a correct, complete, well-written reply.
- 7 = Acceptable, but there is noticeable room for improvement.
- 5-6 = Noticeable gap; should be fixed before sending.
- 3-4 = Major failure.
- 1-2 = Fails completely or causes harm.
Start from 7 and move up only for specific, clear strengths.

Calibrating 8, 9 and 10 for toneEmpathy, relevance, clarity, completeness, and professionalism — score EACH dimension independently:
- 8 = strong and sendable. A correct, complete, grounded, concise, and professional reply normally starts at 8 on each of these dimensions. Being clean and correct alone does not earn a 9.
- 9 = clearly excellent. Give a dimension 9 when the reply demonstrates a specific, observable strength beyond the basic requirements of THAT dimension, for example: unusually specific handling of the customer's circumstances; an especially clear explanation of why the answer applies to them; strong anticipation of an obvious follow-up; particularly effective organization of a multi-part request; empathy that is specific rather than generic. 8 is NOT a ceiling: when you identify such a strength in "strengths", that is evidence it exists, and you MUST raise the dimension it belongs to. A strength raises only the dimension(s) it actually demonstrates — e.g. anticipating a follow-up can raise completeness without raising toneEmpathy. One dimension can reach 9 even if the others stay at 8.
- 10 = exceptional. Reserve 10 for a dimension that is essentially outstanding, with no meaningful improvement remaining and unusually strong execution. Never give 10 merely because the reply is correct, grounded, complete, concise, polite, or professional.
- Below 8 still requires a specific weakness for that dimension, named in "improvements". Do not lower a good reply just to avoid high scores.

groundedness is different: it measures the absence of fabrication, not extra effort, and needs no stylistic strength. Give 9-10 when every company-specific claim is supported by the email or knowledge base excerpts and applied correctly to this customer's situation, even if the reply is short or simple.

Hard limits (a score must not exceed these):
- relevance: max 5 if the reply redirects the customer elsewhere or gives a generic answer that ignores their situation.
- completeness: max 6 if any customer question/request is unanswered; max 4 if two or more are unanswered.
- groundedness: max 4 if the reply makes any unsupported company-specific claim; max 6 if it applies a real policy incorrectly to the customer's situation.

Risk flags — check the reply against this fixed list and report any that apply (empty array if none). "Unsupported refund promise" and "Invented policy or fact" apply ONLY when the claim is unsupported by BOTH the email and the knowledge base excerpts above — a refund promise, price, or policy statement that matches the knowledge base excerpts is correct and must not be flagged. If any customer question/request is "unanswered", include "Ignored customer's question".
${RISK_FLAG_TYPES.map((t) => `- ${t}`).join("\n")}

Respond with ONLY a single JSON object (no extra text, no markdown fences) with keys in exactly this order and shape:
{"customerQuestions": [{"question": "<the customer's question or request, briefly>", "status": "<answered | partly answered | unanswered>"}], "strengths": "<one or two sentences on what the reply did well>", "improvements": "<one or two sentences on what could be improved>", "topSuggestion": "<the single most important change to make>", "scores": {${SCORE_DIMENSIONS.map((d) => `"${d}": <1-10>`).join(", ")}}, "riskFlags": [{"type": "<one of the risk flag types above, verbatim>", "explanation": "<one sentence>"}]}`;
}

// Thrown only by parseEvaluateResponse(), when the model's output is
// malformed or breaks the expected shape (e.g. a customer-question status of
// "grounded"). Kept distinct from provider/network errors so evaluateReply()
// can retry just this case.
export class InvalidEvaluationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvaluationOutputError";
  }
}

function isScoreValue(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 1 && value <= 10;
}

function isAnswerStatus(value: unknown): value is AnswerStatus {
  return typeof value === "string" && (ANSWER_STATUSES as readonly string[]).includes(value);
}

function isRiskFlagType(value: unknown): value is RiskFlagType {
  return typeof value === "string" && (RISK_FLAG_TYPES as readonly string[]).includes(value);
}

function parseEvaluateResponse(raw: string): Omit<EvaluateResult, "overallScore"> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidEvaluationOutputError("Model response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidEvaluationOutputError("Model response was not a JSON object.");
  }

  const { customerQuestions, scores, strengths, improvements, topSuggestion, riskFlags } =
    parsed as Record<string, unknown>;

  if (!Array.isArray(customerQuestions)) {
    throw new InvalidEvaluationOutputError("Model did not return a customerQuestions array.");
  }
  const validatedQuestions: CustomerQuestion[] = customerQuestions.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new InvalidEvaluationOutputError(`Customer question at index ${index} was not an object.`);
    }
    const { question, status } = item as Record<string, unknown>;
    if (typeof question !== "string" || question.trim().length === 0) {
      throw new InvalidEvaluationOutputError(`Customer question at index ${index} is missing its text.`);
    }
    if (!isAnswerStatus(status)) {
      throw new InvalidEvaluationOutputError(`Customer question at index ${index} has an unknown status: ${JSON.stringify(status)}`);
    }
    return { question, status };
  });

  if (typeof scores !== "object" || scores === null) {
    throw new InvalidEvaluationOutputError("Model did not return a scores object.");
  }
  const rawScores = scores as Record<string, unknown>;
  const validatedScores = {} as Scores;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = rawScores[dimension];
    if (!isScoreValue(value)) {
      throw new InvalidEvaluationOutputError(`Model returned an invalid score for "${dimension}": ${JSON.stringify(value)}`);
    }
    validatedScores[dimension] = value;
  }

  if (typeof strengths !== "string" || strengths.trim().length === 0) {
    throw new InvalidEvaluationOutputError("Model did not return strengths feedback.");
  }
  if (typeof improvements !== "string" || improvements.trim().length === 0) {
    throw new InvalidEvaluationOutputError("Model did not return improvements feedback.");
  }
  if (typeof topSuggestion !== "string" || topSuggestion.trim().length === 0) {
    throw new InvalidEvaluationOutputError("Model did not return a top suggestion.");
  }
  if (!Array.isArray(riskFlags)) {
    throw new InvalidEvaluationOutputError("Model did not return a riskFlags array.");
  }

  const validatedFlags: RiskFlag[] = riskFlags.map((flag, index) => {
    if (typeof flag !== "object" || flag === null) {
      throw new InvalidEvaluationOutputError(`Risk flag at index ${index} was not an object.`);
    }
    const { type, explanation } = flag as Record<string, unknown>;
    if (!isRiskFlagType(type)) {
      throw new InvalidEvaluationOutputError(`Risk flag at index ${index} has an unknown type: ${JSON.stringify(type)}`);
    }
    if (typeof explanation !== "string" || explanation.trim().length === 0) {
      throw new InvalidEvaluationOutputError(`Risk flag at index ${index} is missing an explanation.`);
    }
    return { type, explanation };
  });

  return {
    customerQuestions: validatedQuestions,
    scores: validatedScores,
    strengths,
    improvements,
    topSuggestion,
    riskFlags: validatedFlags,
  };
}

function hasFlagIn(riskFlags: RiskFlag[], types: RiskFlagType[]): boolean {
  return riskFlags.some((f) => types.includes(f.type));
}

/**
 * Makes scores, flags and the question analysis agree, whatever the model
 * returned. The prompt states the same limits; enforcing them here means a
 * model that forgets one can't produce a contradictory evaluation (e.g. an
 * "unanswered" question alongside completeness 9). Only limits with a
 * structured signal are enforced — "generic/redirecting reply" (relevance)
 * and "real policy misapplied" (groundedness) are judgment calls left to
 * the prompt.
 */
function applyConsistencyRules(
  parsed: Omit<EvaluateResult, "overallScore">
): Omit<EvaluateResult, "overallScore"> {
  const scores = { ...parsed.scores };
  const riskFlags = [...parsed.riskFlags];

  const unanswered = parsed.customerQuestions.filter((q) => q.status === "unanswered");
  if (unanswered.length > 0 && !riskFlags.some((f) => f.type === "Ignored customer's question")) {
    riskFlags.push({
      type: "Ignored customer's question",
      explanation: `The reply leaves ${unanswered.length === 1 ? "a customer question/request" : `${unanswered.length} customer questions/requests`} unanswered: ${unanswered.map((q) => `"${q.question}"`).join(", ")}.`,
    });
  }

  if (unanswered.length >= 2) scores.completeness = Math.min(scores.completeness, 4);
  else if (unanswered.length === 1) scores.completeness = Math.min(scores.completeness, 6);
  if (riskFlags.some((f) => f.type === "Ignored customer's question")) {
    scores.completeness = Math.min(scores.completeness, 5);
  }
  if (hasFlagIn(riskFlags, CRITICAL_RISK_FLAG_TYPES)) {
    scores.groundedness = Math.min(scores.groundedness, 4);
  }

  return { ...parsed, scores, riskFlags };
}

// Relevance and groundedness matter most: a reply that misses the point or
// makes things up is worse than one that is merely a little stiff.
const DIMENSION_WEIGHTS: Record<ScoreDimension, number> = {
  relevance: 0.25,
  groundedness: 0.25,
  completeness: 0.2,
  toneEmpathy: 0.1,
  clarity: 0.1,
  professionalism: 0.1,
};

/**
 * We compute the overall score ourselves rather than trusting the model's
 * arithmetic. It is the lowest of:
 * - the weighted average of the six dimensions;
 * - the weakest dimension + 1.5, so strong dimensions can't mask a failing
 *   one;
 * - a risk-flag cap: 4.9 for a critical flag ("Do not send" — one
 *   fabricated claim is never a borderline case), 6.9 for a major flag
 *   (never "Ready to send"), otherwise 10.
 */
function computeOverallScore(scores: Scores, riskFlags: RiskFlag[]): number {
  const weighted = SCORE_DIMENSIONS.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d] * scores[d], 0);
  const weakestLimit = Math.min(...SCORE_DIMENSIONS.map((d) => scores[d])) + 1.5;
  const flagCap = hasFlagIn(riskFlags, CRITICAL_RISK_FLAG_TYPES)
    ? 4.9
    : hasFlagIn(riskFlags, MAJOR_RISK_FLAG_TYPES)
      ? 6.9
      : 10;
  return Math.round(Math.min(weighted, weakestLimit, flagCap) * 10) / 10;
}

export async function evaluateReply(input: EvaluateInput): Promise<EvaluateResult> {
  const provider = getProvider();
  const prompt = buildPrompt(input);

  // The model occasionally returns output that breaks the expected shape
  // (e.g. an invalid customer-question status). Invalid values are never
  // coerced: we retry the same request once, and if that is also invalid
  // its error propagates exactly as before. Provider errors are not
  // retried here — lib/ai/provider.ts already handles transient ones.
  let parsedRaw: Omit<EvaluateResult, "overallScore">;
  try {
    parsedRaw = parseEvaluateResponse(await provider.complete(prompt));
  } catch (error) {
    if (!(error instanceof InvalidEvaluationOutputError)) throw error;
    parsedRaw = parseEvaluateResponse(await provider.complete(prompt));
  }

  const parsed = applyConsistencyRules(parsedRaw);
  const overallScore = computeOverallScore(parsed.scores, parsed.riskFlags);
  return { ...parsed, overallScore };
}
