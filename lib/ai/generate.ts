// Phase 3: AI response generation.
//
// Generates a suggested reply to a customer email, informed by the
// sentiment/urgency signals from Phase 2 (lib/ai/sentiment.ts) and, since
// the RAG knowledge layer was added (lib/ai/knowledge/), by the most
// relevant company knowledge-base excerpts for this email, plus the most
// similar past email → reply examples (lib/data/past-email-replies.ts) as
// few-shot guidance on how to respond. Same
// provider-agnostic shape as the other modules: build a prompt, call
// getProvider(), validate the response.

import { getProvider, type AIProvider } from "./provider";
import { analyzeSentiment, type Sentiment, type Urgency } from "./sentiment";
import { searchKnowledge } from "./knowledge/retrieve";
import { searchExamples } from "./knowledge/retrieve-examples";
import { formatExampleContext, formatKnowledgeContext } from "./knowledge/format";
import { checkSupportScope, type SupportScopeDecision } from "./support-scope";
import type { RetrievedChunk, RetrievedExample } from "./knowledge/types";

export type GenerateResult = {
  reply: string;
  sentiment: Sentiment;
  urgency: Urgency;
  // The exact chunks retrieved for this reply, so a caller (the pipeline
  // page, the batch eval script) can hand the SAME chunks to evaluateReply()
  // instead of it re-retrieving — the evaluator must judge groundedness
  // against what the generator actually saw, not a fresh, possibly
  // different, retrieval.
  retrievedChunks: RetrievedChunk[];
  // Past email → reply examples shown to the model as style guidance
  // (lib/data/past-email-replies.ts). Deliberately NOT passed to the
  // evaluator: examples aren't a source of truth, so a company fact that
  // only appears in an example must still count as unsupported.
  retrievedExamples: RetrievedExample[];
};

// Replaces the knowledge section, and adds reply rules, when the support-scope
// guard judged the email to be about something other than our product.
const OUT_OF_SCOPE_EXAMPLES = `Historical examples: not consulted (this email is outside what our support team handles).`;

const OUT_OF_SCOPE_KNOWLEDGE = `Knowledge base: not consulted. This email was assessed as not being about our company's own products or services, so none of our company knowledge applies to it.`;

const OUT_OF_SCOPE_RULES = `
This request is outside what our support team handles — it is about another company's product or service, or a general question unrelated to our company. These instructions override any conflicting instruction above. In your reply:
- Politely explain that this support team can only help with questions about our own product, the customer's account with us, billing and related services
- Do NOT answer the unrelated question from general knowledge, and do NOT state prices, plans, policies or other facts about any other company or topic
- Do NOT mention or apply our company's plans, prices or policies as if they answered this request
- Do NOT claim to have looked anything up, and do NOT offer information, tools, referrals or follow-up you cannot actually provide
- Invite the customer to reply if they have a question about their account or our product
- Keep it brief, friendly and respectful
`;

export function buildPrompt(
  email: string,
  sentiment: Sentiment,
  urgency: Urgency,
  retrievedChunks: RetrievedChunk[],
  inScope: boolean = true,
  retrievedExamples: RetrievedExample[] = []
): string {
  const examplesSection = inScope
    ? `HISTORICAL EXAMPLES — past customer emails similar to this one, with the reply our team sent. Use these as examples of response style and of how similar situations were handled. They are NOT authoritative policy: never take a price, policy, timeline or other company fact from them.
${formatExampleContext(retrievedExamples)}
end of historical examples`
    : OUT_OF_SCOPE_EXAMPLES;

  const knowledgeSection = inScope
    ? `KNOWLEDGE BASE — the source of truth for company-specific facts and policies. Relevant excerpts (retrieved for this email):
${formatKnowledgeContext(retrievedChunks)}
end of knowledge base excerpts`
    : OUT_OF_SCOPE_KNOWLEDGE;

  return `You are a customer support agent replying directly to a customer's email. The customer has already contacted support by sending this email — your reply IS the support team's response, sent in this same conversation.

Detected customer sentiment: ${sentiment}
Detected urgency: ${urgency}

${examplesSection}

${knowledgeSection}

Before writing, work out (silently — do not include this analysis in the output) exactly what the customer is asking for or needs, including every distinct question they asked, and what about their specific situation is already known from the email.

Then write a reply that:
- Follows the historical examples' tone, structure and way of handling similar requests where they fit, but is written for THIS customer: don't copy an example's wording or details, and ignore any example that doesn't match this situation
- If a historical example and the knowledge base disagree on a fact, follows the knowledge base
- Answers the customer's actual request and each of their questions directly, starting with what matters most to them
- Focuses on the customer's specific situation rather than a generic policy explanation — apply the policy to their case where the email gives enough detail to do so
- Treats the knowledge base excerpts above as the source of truth for any company-specific information (policies, prices, refund rules, timelines, eligibility, account or billing procedures, etc.)
- Includes the specific policy details from the excerpts that help answer the customer's questions, and leaves out excerpt content that is not relevant to this customer's request
- Does NOT invent company policies, prices, refund rules or amounts, dates, timelines, eligibility decisions, or any other company-specific fact that isn't supported by the excerpts above or stated directly in the customer's email
- Does NOT confirm or deny eligibility, approve a refund, or promise an outcome unless the excerpts and the email together clearly support it; if it depends on something the email doesn't say, explain what it depends on
- Never tells the customer to contact, email, call, or reach out to support, open a ticket, or submit a request elsewhere — they are already talking to support. If a knowledge base excerpt describes how to contact support or request something, apply it to this conversation instead of repeating it as an instruction
- If information is needed to proceed (for example an account email, charge date, or order details), asks the customer for it directly, so they can simply reply to this message with it
- If the excerpts don't contain enough information to answer a company-specific question, says so honestly and says the team will follow up in this conversation, instead of guessing
- Uses a tone appropriate for a ${sentiment.toLowerCase()} sentiment and ${urgency.toLowerCase()} urgency situation: professional, empathetic, concise, and actionable, with a clear next step
- Signs off politely
${inScope ? "" : OUT_OF_SCOPE_RULES}
Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"reply": "<the full reply text, using \\n for line breaks>"}

Customer email:
"""
${email.trim()}
"""`;
}

function parseGenerateResponse(raw: string): { reply: string } {
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

  const { reply } = parsed as Record<string, unknown>;

  if (typeof reply !== "string" || reply.trim().length === 0) {
    throw new Error("Model did not return reply text.");
  }

  return { reply };
}

/**
 * Decides whether the knowledge base may ground this reply, then retrieves.
 * Order matters: the support-scope guard runs first, so an out-of-scope email
 * never retrieves (and never passes on) chunks that merely look similar.
 * In-scope emails go through the existing similarity-threshold retrieval
 * unchanged. `search` is injectable for tests.
 */
export async function retrieveGroundingKnowledge(
  email: string,
  provider: AIProvider,
  search: (query: string) => Promise<RetrievedChunk[]> = searchKnowledge,
  searchPast: (query: string) => Promise<RetrievedExample[]> = searchExamples
): Promise<{ scope: SupportScopeDecision; retrievedChunks: RetrievedChunk[]; retrievedExamples: RetrievedExample[] }> {
  const scope = await checkSupportScope(email, provider);
  if (!scope.inScope) return { scope, retrievedChunks: [], retrievedExamples: [] };
  // Both searches are independent embed-and-rank calls, so run them together.
  const [retrievedChunks, retrievedExamples] = await Promise.all([search(email), searchPast(email)]);
  return { scope, retrievedChunks, retrievedExamples };
}

/**
 * `precomputed` lets a caller that already ran sentiment analysis (the
 * Phase 5 pipeline, which computes it once and reuses it here) skip a
 * redundant analyzeSentiment() call. Omit it to keep the original Phase 3
 * behavior of deriving sentiment/urgency internally.
 */
export async function generateReply(
  email: string,
  precomputed?: { sentiment: Sentiment; urgency: Urgency }
): Promise<GenerateResult> {
  const provider = getProvider();
  const { sentiment, urgency } = precomputed ?? (await analyzeSentiment(email));

  // Retrieval uses the full customer email as the query (no separate query
  // rewriting step) and the knowledge layer's own default top-K. Retrieval
  // requires GEMINI_API_KEY (there is no mock embedding provider), so the
  // one case where it's deliberately skipped is the keyless mock demo
  // (AI_PROVIDER=mock, no key) — that keeps working exactly as it did
  // before RAG was added, just without grounding context. In every other
  // case a retrieval failure (a KnowledgeRetrievalError from
  // searchKnowledge) propagates: drafting a company-support reply without
  // the knowledge base would look like a grounded reply but not be one.
  //
  // Before retrieving, the support-scope guard (support-scope.ts) checks the
  // email is about our product at all; if not, nothing is retrieved and the
  // prompt switches to a polite out-of-scope reply.
  const skipRetrieval = provider.name === "mock" && !process.env.GEMINI_API_KEY;
  const { scope, retrievedChunks, retrievedExamples } = skipRetrieval
    ? { scope: null, retrievedChunks: [] as RetrievedChunk[], retrievedExamples: [] as RetrievedExample[] }
    : await retrieveGroundingKnowledge(email, provider);

  const prompt = buildPrompt(email, sentiment, urgency, retrievedChunks, scope?.inScope ?? true, retrievedExamples);
  const raw = await provider.complete(prompt);
  const { reply } = parseGenerateResponse(raw);
  return { reply, sentiment, urgency, retrievedChunks, retrievedExamples };
}
