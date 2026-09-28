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
// in the email or knowledge base — they cap the overall score at 4.9
// ("Do not send"). See lib/ai/evaluate.ts.
export const CRITICAL_RISK_FLAG_TYPES: RiskFlagType[] = [
  "Unsupported refund promise",
  "Unverified fix claim",
  "Invented policy or fact",
];

// Serious but not fabrications — they cap the overall score at 6.9, so the
// reply can never read as "Ready to send".
export const MAJOR_RISK_FLAG_TYPES: RiskFlagType[] = [
  "Ignored customer's question",
  "Inappropriate tone",
];
