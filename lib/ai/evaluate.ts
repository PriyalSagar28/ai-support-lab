// Phase 4: AI response evaluation (QA-style).
//
// Evaluates a support reply against the original email and the sentiment/
// urgency context it was written for. Scores six dimensions (1-10), flags
// specific risky behaviors (unsupported promises, invented facts, ignored
// questions, inappropriate tone), and derives an overall score ourselves —
// we don't trust the model to average six numbers correctly, and a critical
// risk flag caps the score regardless of how the other dimensions read.

import { getProvider } from "./provider";
import type { Sentiment, Urgency } from "./sentiment-labels";
import { SCORE_DIMENSIONS, DIMENSION_DESCRIPTIONS, type ScoreDimension } from "./score-dimensions";
import { RISK_FLAG_TYPES, CRITICAL_RISK_FLAG_TYPES, type RiskFlagType } from "./risk-flags";

export type Scores = Record<ScoreDimension, number>;

export type RiskFlag = {
  type: RiskFlagType;
  explanation: string;
};

export type EvaluateInput = {
  email: string;
  reply: string;
  sentiment: Sentiment;
  urgency: Urgency;
};

export type EvaluateResult = {
  scores: Scores;
  overallScore: number;
  strengths: string;
  improvements: string;
  topSuggestion: string;
  riskFlags: RiskFlag[];
};

function buildPrompt({ email, reply, sentiment, urgency }: EvaluateInput): string {
  return `You are a QA reviewer scoring a customer support reply before it is sent.

Customer email:
"""
${email.trim()}
"""

Detected customer sentiment: ${sentiment}
Detected urgency: ${urgency}

Proposed reply:
"""
${reply.trim()}
"""

Score the reply from 1 (poor) to 10 (excellent) on each dimension:
${SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join("\n")}

Also check the reply against this fixed list of risk flags and report any that apply (empty array if none):
${RISK_FLAG_TYPES.map((t) => `- ${t}`).join("\n")}

Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"scores": {${SCORE_DIMENSIONS.map((d) => `"${d}": <1-10>`).join(", ")}}, "strengths": "<one or two sentences on what the reply did well>", "improvements": "<one or two sentences on what could be improved>", "topSuggestion": "<the single most important change to make>", "riskFlags": [{"type": "<one of the risk flag types above, verbatim>", "explanation": "<one sentence>"}]}`;
}

function isScoreValue(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 1 && value <= 10;
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
    throw new Error("Model response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response was not a JSON object.");
  }

  const { scores, strengths, improvements, topSuggestion, riskFlags } = parsed as Record<string, unknown>;

  if (typeof scores !== "object" || scores === null) {
    throw new Error("Model did not return a scores object.");
  }
  const rawScores = scores as Record<string, unknown>;
  const validatedScores = {} as Scores;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = rawScores[dimension];
    if (!isScoreValue(value)) {
      throw new Error(`Model returned an invalid score for "${dimension}": ${JSON.stringify(value)}`);
    }
    validatedScores[dimension] = value;
  }

  if (typeof strengths !== "string" || strengths.trim().length === 0) {
    throw new Error("Model did not return strengths feedback.");
  }
  if (typeof improvements !== "string" || improvements.trim().length === 0) {
    throw new Error("Model did not return improvements feedback.");
  }
  if (typeof topSuggestion !== "string" || topSuggestion.trim().length === 0) {
    throw new Error("Model did not return a top suggestion.");
  }
  if (!Array.isArray(riskFlags)) {
    throw new Error("Model did not return a riskFlags array.");
  }

  const validatedFlags: RiskFlag[] = riskFlags.map((flag, index) => {
    if (typeof flag !== "object" || flag === null) {
      throw new Error(`Risk flag at index ${index} was not an object.`);
    }
    const { type, explanation } = flag as Record<string, unknown>;
    if (!isRiskFlagType(type)) {
      throw new Error(`Risk flag at index ${index} has an unknown type: ${JSON.stringify(type)}`);
    }
    if (typeof explanation !== "string" || explanation.trim().length === 0) {
      throw new Error(`Risk flag at index ${index} is missing an explanation.`);
    }
    return { type, explanation };
  });

  return { scores: validatedScores, strengths, improvements, topSuggestion, riskFlags: validatedFlags };
}

/**
 * We compute the overall score ourselves rather than trusting the model to
 * average six numbers correctly. A critical risk flag (an unsupported
 * promise, an unverified fix claim, or an invented policy/fact) caps the
 * score below the "needs revision" band entirely — one fabricated claim
 * should read as "do not send", not a borderline case, even if the writing
 * is otherwise polished.
 */
function computeOverallScore(scores: Scores, riskFlags: RiskFlag[]): number {
  const values = Object.values(scores);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const hasCriticalFlag = riskFlags.some((f) =>
    (CRITICAL_RISK_FLAG_TYPES as string[]).includes(f.type)
  );
  const capped = hasCriticalFlag ? Math.min(mean, 4.9) : mean;
  return Math.round(capped * 10) / 10;
}

export async function evaluateReply(input: EvaluateInput): Promise<EvaluateResult> {
  const provider = getProvider();
  const prompt = buildPrompt(input);
  const raw = await provider.complete(prompt);
  const parsed = parseEvaluateResponse(raw);
  const overallScore = computeOverallScore(parsed.scores, parsed.riskFlags);
  return { ...parsed, overallScore };
}
