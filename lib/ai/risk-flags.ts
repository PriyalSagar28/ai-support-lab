// The fixed taxonomy of risky reply behaviors the evaluator checks for.
// Pure — no imports — same reasoning as score-dimensions.ts.

export const RISK_FLAG_TYPES = [
  "Unsupported refund promise",
  "Unverified fix claim",
  "Invented policy or fact",
  "Ignored customer's question",
  "Inappropriate tone",
] as const;

export type RiskFlagType = (typeof RISK_FLAG_TYPES)[number];

// These three specifically mean the reply asserted something not grounded
// in the email — serious enough to cap the overall score (see
// lib/ai/evaluate.ts), not just pull down one dimension like the other two.
export const CRITICAL_RISK_FLAG_TYPES: RiskFlagType[] = [
  "Unsupported refund promise",
  "Unverified fix claim",
  "Invented policy or fact",
];
