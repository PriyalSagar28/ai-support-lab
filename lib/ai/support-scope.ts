// Support-scope guard: decides whether a customer email is actually about
// OUR product before the knowledge base is allowed to ground the reply.
//
// Why this exists: retrieval is similarity-only, and similarity can't tell
// whose subscription an email is about. "How much does Netflix Premium
// cost?" scores ~0.61 and "What are Spotify's subscription plans?" ~0.65
// against our own plan/billing docs — above the 0.60 retrieval floor — so
// the generator was handed our pricing as "relevant knowledge" for another
// company's question. The retrieval threshold (knowledge/retrieve.ts) stays
// as a second, independent safeguard; this check answers a different
// question: not "is some chunk similar?" but "is this request about us?".
//
// It's a judgment about the customer's actual request, made by the same
// provider as every other AI step — deliberately not a keyword/brand list,
// which would miss unlisted companies and wrongly block legitimate emails
// that merely mention one ("I'm switching to you from X").

import { getProvider, type AIProvider } from "./provider";

export type SupportScopeDecision = {
  inScope: boolean;
  reason: string;
  // "model": the provider judged it. "skipped": no judgment possible (mock
  // provider). "fallback": the check failed, so we fell back to in-scope.
  via: "model" | "skipped" | "fallback";
};

// What "our product" is, taken from the knowledge base in knowledge/.
const PRODUCT_DESCRIPTION =
  "a customer-support software product for teams: a shared inbox for customer emails and support tickets, with automation rules, user seats, and Starter, Pro and Business subscription plans";

export function buildSupportScopePrompt(email: string): string {
  return `You are the intake step for the customer support team of one specific company. The company sells ${PRODUCT_DESCRIPTION}.

Decide whether the customer's email is a request this company's support team can help with.

IN SCOPE — the request is about this company or its product, for example:
- the customer's account, login or access
- billing, charges, payments, invoices, refunds, cancellation
- this company's subscription plans, pricing, upgrades or downgrades
- bugs, outages, syncing or other technical problems with the product
- feature requests, feedback, or general questions about the product or company
- emails that mention another company only as context while asking about this company (for example comparing this company's plans with a competitor's, switching from a competitor, or asking about a charge from this company)

OUT OF SCOPE — what the customer actually wants is about something else, for example:
- the products, prices, plans, accounts or support of a different company or service
- general knowledge, weather, news, or other questions unrelated to this company

Judge by what the customer actually wants answered, not by individual words. Words like "subscription", "plan", "price" or "account" are in scope only when they refer to this company's product. If the email names a different company or service as the thing the customer wants prices, plans or help for, it is out of scope even when the subject line sounds like an ordinary billing question. If the request is genuinely ambiguous, treat it as in scope.

Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"inScope": <true or false>, "reason": "<one short sentence>"}

Customer email:
"""
${email.trim()}
"""`;
}

export function parseSupportScopeResponse(raw: string): { inScope: boolean; reason: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Support-scope response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Support-scope response was not a JSON object.");
  }

  const { inScope, reason } = parsed as Record<string, unknown>;
  if (typeof inScope !== "boolean") {
    throw new Error('Support-scope response is missing a boolean "inScope".');
  }

  return { inScope, reason: typeof reason === "string" ? reason.trim() : "" };
}

// Server-side only, and off in production unless DEBUG_SUPPORT_SCOPE is set.
// Never sent to the client.
function logDecision(decision: SupportScopeDecision): void {
  if (process.env.NODE_ENV === "production" && !process.env.DEBUG_SUPPORT_SCOPE) return;
  const label = decision.inScope ? "in scope — knowledge retrieval allowed" : "out of scope — knowledge retrieval blocked";
  console.info(`[support-scope] ${label} (${decision.via})${decision.reason ? `: ${decision.reason}` : ""}`);
}

/**
 * Judges whether `email` is about our product. Fails open: if the check
 * itself errors or returns malformed output, the email is treated as in
 * scope, which is exactly the pre-guard behavior (and the retrieval
 * similarity floor still applies). A broken guard must never stop genuine
 * customers from getting a grounded reply.
 */
export async function checkSupportScope(
  email: string,
  provider: AIProvider = getProvider()
): Promise<SupportScopeDecision> {
  let decision: SupportScopeDecision;

  if (provider.name === "mock") {
    // The mock provider has no language understanding to judge this with.
    decision = { inScope: true, reason: "mock provider cannot judge scope", via: "skipped" };
  } else {
    try {
      const raw = await provider.complete(buildSupportScopePrompt(email));
      decision = { ...parseSupportScopeResponse(raw), via: "model" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[support-scope] check failed, falling back to in scope: ${message}`);
      decision = { inScope: true, reason: "scope check unavailable", via: "fallback" };
    }
  }

  logDecision(decision);
  return decision;
}
