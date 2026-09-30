// Offline tests for the evaluator's deterministic claim rule in
// lib/ai/evaluate.ts: an "unsupported" company claim must raise a
// fabrication flag and cap groundedness. No network — model output is
// written by hand. Whether the real model marks claims correctly is
// measured by `npm run benchmark:evaluator` (BM-13/BM-14), not here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyConsistencyRules, type CompanyClaim, type EvaluateResult } from "../../lib/ai/evaluate";

function evaluation(companyClaims: CompanyClaim[], overrides: Partial<EvaluateResult> = {}): Omit<EvaluateResult, "overallScore"> {
  return {
    customerQuestions: [{ question: "Automation rule cap?", status: "answered" }],
    companyClaims,
    scores: { toneEmpathy: 8, relevance: 8, clarity: 8, completeness: 8, professionalism: 8, groundedness: 10 },
    strengths: "Clear.",
    improvements: "None.",
    topSuggestion: "None.",
    riskFlags: [],
    ...overrides,
  };
}

const SUPPORTED: CompanyClaim = { claim: "Pro is $29/month", support: "knowledge base", evidence: "Pro — $29/month" };
const UNSUPPORTED: CompanyClaim = { claim: "No cap on automation rules", support: "unsupported", evidence: "" };

test("supported claims leave flags and groundedness untouched", () => {
  const result = applyConsistencyRules(
    evaluation([SUPPORTED, { claim: "Customer is on Pro", support: "email", evidence: "We're on the Pro plan" }])
  );
  assert.deepEqual(result.riskFlags, []);
  assert.equal(result.scores.groundedness, 10);
});

test("no claims at all is not treated as a problem", () => {
  const result = applyConsistencyRules(evaluation([]));
  assert.deepEqual(result.riskFlags, []);
  assert.equal(result.scores.groundedness, 10);
});

test("an unsupported claim raises 'Invented policy or fact' naming the claim and caps groundedness at 4", () => {
  const result = applyConsistencyRules(evaluation([SUPPORTED, UNSUPPORTED]));
  assert.deepEqual(result.riskFlags.map((f) => f.type), ["Invented policy or fact"]);
  assert.match(result.riskFlags[0].explanation, /No cap on automation rules/);
  assert.equal(result.scores.groundedness, 4);
});

test("several unsupported claims produce one flag listing all of them", () => {
  const result = applyConsistencyRules(
    evaluation([UNSUPPORTED, { claim: "Rules sync instantly", support: "unsupported", evidence: "" }])
  );
  assert.equal(result.riskFlags.length, 1);
  assert.match(result.riskFlags[0].explanation, /2 company-specific claims/);
});

test("an existing fabrication flag is not duplicated", () => {
  const result = applyConsistencyRules(
    evaluation([{ claim: "Refund already issued", support: "unsupported", evidence: "" }], {
      riskFlags: [{ type: "Unsupported refund promise", explanation: "Promises an unverified refund." }],
    })
  );
  assert.deepEqual(result.riskFlags.map((f) => f.type), ["Unsupported refund promise"]);
  assert.equal(result.scores.groundedness, 4);
});

test("an unsupported claim adds its flag alongside an existing non-fabrication flag", () => {
  const result = applyConsistencyRules(
    evaluation([UNSUPPORTED], {
      riskFlags: [{ type: "Inappropriate tone", explanation: "Dismissive." }],
    })
  );
  assert.deepEqual(result.riskFlags.map((f) => f.type), ["Inappropriate tone", "Invented policy or fact"]);
  assert.equal(result.scores.groundedness, 4);
});
