// Provider-agnostic AI layer.
//
// Every AI capability in this app (categorize, sentiment, generate, evaluate)
// will eventually call `getProvider()` instead of a specific vendor SDK. That
// keeps vendor code in exactly one place, so swapping "mock" for a real
// provider later never touches page or API route code.
//
// This module is server-only: real providers will read their API keys from
// environment variables here, and this file must never be imported from a
// "use client" component.

import type { Category } from "./categories";
import type { Sentiment, Urgency } from "./sentiment-labels";
import type { RiskFlagType } from "./risk-flags";

export type AIProvider = {
  name: string;
  complete: (prompt: string) => Promise<string>;
};

// --- Mock provider ---------------------------------------------------------
//
// The mock has no real language understanding — it's a crude keyword-based
// stand-in so the app is fully demoable without any API key. It intentionally
// only recognizes prompts shaped like our categorize prompt (asking for a
// {category, confidence, reason} JSON object); anything else falls back to a
// generic echo. This is why some realistic emails ("any plans to add X?")
// won't match a category here even though a real LLM would understand them
// easily — that gap is exactly what swapping in a real provider later fixes.

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  // "payment" was dropped: it's generic enough to show up in refund requests
  // too ("refund the last payment"), which was tipping genuine refund
  // requests toward Billing just because they also mention a payment.
  Billing: ["charge", "invoice", "billing", "subscription"],
  "Bug/Technical Issue": [
    "bug", "error", "crash", "broken", "not working", "fails", "failing", "glitch",
    "down", "completely down", "outage", "unavailable", "stopped syncing", "not fixed",
  ],
  // "please refund" is a second, more specific signal than the bare word
  // "refund" so an explicit refund ask can outscore incidental billing words
  // like "charge" or "subscription" in the same email.
  Refund: ["refund", "money back", "reimburse", "please refund"],
  "Account Issue": ["log in", "login", "password", "locked out", "sign in", "can't access", "cannot access"],
  "Feature Request": ["feature request", "feature", "would be nice", "suggestion", "wish", "could you add", "add support"],
  Other: [],
};

// Checked in this order so more specific categories win ties over broader
// ones (e.g. an email that mentions both "refund" and "charge" should read
// as Refund, not Billing).
const SCORING_ORDER: Category[] = [
  "Refund",
  "Account Issue",
  "Bug/Technical Issue",
  "Feature Request",
  "Billing",
];

function looksLikeCategorizePrompt(prompt: string): boolean {
  return prompt.includes('"category"') && prompt.includes('"confidence"');
}

function mockCategorize(prompt: string): string {
  const emailMatch = prompt.match(/"""([\s\S]*?)"""/);
  const email = (emailMatch?.[1] ?? prompt).toLowerCase();

  let bestCategory: Category = "Other";
  let bestHits: string[] = [];

  for (const category of SCORING_ORDER) {
    const hits = CATEGORY_KEYWORDS[category].filter((keyword) => email.includes(keyword));
    if (hits.length > bestHits.length) {
      bestHits = hits;
      bestCategory = category;
    }
  }

  const confidence =
    bestHits.length === 0
      ? 0.5
      : Math.round(Math.min(0.95, 0.55 + bestHits.length * 0.15) * 100) / 100;

  const reason =
    bestHits.length === 0
      ? "Mock provider: no strong keyword matches found in the email, defaulting to Other."
      : `Mock provider: matched keyword(s) ${bestHits.map((k) => `"${k}"`).join(", ")}, typically associated with ${bestCategory}.`;

  return JSON.stringify({ category: bestCategory, confidence, reason });
}

// --- Sentiment analysis (Phase 2) ------------------------------------------
//
// Same idea as categorize above: keyword counting on two independent axes
// (sentiment and urgency), not real language understanding.

const POSITIVE_KEYWORDS = ["thank", "appreciat", "great", "lov", "awesome", "helped", "happy", "glad"];
// A complaint doesn't need explicit emotion words ("frustrated", "angry")
// to read as negative — describing something broken/unavailable in a
// support email carries negative sentiment on its own (e.g. "everything is
// down" is a bad-experience report even without any feeling-words in it).
const NEGATIVE_KEYWORDS = [
  "frustrat", "angry", "unacceptable", "disappoint", "terrible", "annoy", "upset", "worst", "cancel",
  "down", "completely down", "outage", "piling up", "stopped syncing", "not fixed",
];

// Checked before HIGH so an explicit "not urgent" isn't misread as urgent
// just because the word "urgent" appears inside it.
const LOW_URGENCY_KEYWORDS = ["no rush", "whenever", "not urgent", "just a suggestion", "no hurry"];
const HIGH_URGENCY_KEYWORDS = ["urgent", "asap", "immediately", "right now", "critical", "down", "blocked", "third time", "today"];

function looksLikeSentimentPrompt(prompt: string): boolean {
  return prompt.includes('"sentiment"') && prompt.includes('"urgency"');
}

function mockSentiment(prompt: string): string {
  const emailMatch = prompt.match(/"""([\s\S]*?)"""/);
  const email = (emailMatch?.[1] ?? prompt).toLowerCase();

  const positiveHits = POSITIVE_KEYWORDS.filter((k) => email.includes(k));
  const negativeHits = NEGATIVE_KEYWORDS.filter((k) => email.includes(k));

  let sentiment: Sentiment = "Neutral";
  let sentimentHits: string[] = [];
  if (positiveHits.length > negativeHits.length) {
    sentiment = "Positive";
    sentimentHits = positiveHits;
  } else if (negativeHits.length > positiveHits.length) {
    sentiment = "Negative";
    sentimentHits = negativeHits;
  }

  const lowHits = LOW_URGENCY_KEYWORDS.filter((k) => email.includes(k));
  const highHits = HIGH_URGENCY_KEYWORDS.filter((k) => email.includes(k));

  let urgency: Urgency = "Medium";
  let urgencyHits: string[] = [];
  if (lowHits.length > 0) {
    urgency = "Low";
    urgencyHits = lowHits;
  } else if (highHits.length > 0) {
    urgency = "High";
    urgencyHits = highHits;
  }

  const totalHits = sentimentHits.length + urgencyHits.length;
  const confidence =
    totalHits === 0 ? 0.5 : Math.round(Math.min(0.95, 0.55 + totalHits * 0.1) * 100) / 100;

  const sentimentClause =
    sentimentHits.length > 0
      ? `sentiment leans ${sentiment} due to ${sentimentHits.map((k) => `"${k}"`).join(", ")}`
      : "no strong sentiment keywords found, defaulting to Neutral";
  const urgencyClause =
    urgencyHits.length > 0
      ? `urgency is ${urgency} due to ${urgencyHits.map((k) => `"${k}"`).join(", ")}`
      : "no urgency signals found, defaulting to Medium";

  const explanation = `Mock provider: ${sentimentClause}; ${urgencyClause}.`;

  return JSON.stringify({ sentiment, urgency, confidence, explanation });
}

// --- Response generation (Phase 3) ------------------------------------------
//
// Templated, tone-adapted canned replies keyed off the sentiment/urgency the
// prompt already states (computed upstream by the sentiment module before
// this prompt is built) — no real understanding of the specific issue beyond
// quoting the subject line back. A real provider would actually read and
// respond to the body; this is deliberately just enough to demo the shape.

function looksLikeGeneratePrompt(prompt: string): boolean {
  return prompt.includes('"reply"');
}

const OPENINGS: Record<string, string> = {
  Negative: "I'm really sorry for the trouble this has caused you.",
  Neutral: "Thanks for reaching out.",
  Positive: "Thank you so much for the kind words!",
};

const URGENCY_LINES: Record<string, string> = {
  High: "I've flagged this as high priority so we can get it sorted as quickly as possible.",
  Medium: "I'm looking into this now and will follow up shortly.",
  Low: "I'll take a look and get back to you soon — no rush on our end either.",
};

function mockGenerate(prompt: string): string {
  const emailMatch = prompt.match(/"""([\s\S]*?)"""/);
  const email = (emailMatch?.[1] ?? "").trim();

  const sentiment = prompt.match(/Detected customer sentiment:\s*(\w+)/)?.[1] ?? "Neutral";
  const urgency = prompt.match(/Detected urgency:\s*(\w+)/)?.[1] ?? "Medium";

  const subject = email.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  const subjectClause = subject ? ` regarding "${subject}"` : "";

  const opening = OPENINGS[sentiment] ?? OPENINGS.Neutral;

  // A pure thank-you note has no open issue to "look into" or "flag as
  // priority" — branch so the reply doesn't sound like it's investigating a
  // problem that doesn't exist.
  const middle =
    sentiment === "Positive"
      ? "It really means a lot to hear this, and I'll be sure to pass your note along to the team."
      : URGENCY_LINES[urgency] ?? URGENCY_LINES.Medium;
  const closing =
    sentiment === "Positive"
      ? "Please don't hesitate to reach out if there's ever anything else we can help with."
      : "I'll keep you updated as soon as I have more information — please let me know if there's anything else I can help with in the meantime.";

  const reply = `Hi there,

${opening} I wanted to follow up on your message${subjectClause}.

${middle} ${closing}

Best regards,
Support Team`;

  return JSON.stringify({ reply });
}

// --- Response evaluation (Phase 4) ------------------------------------------
//
// Keyword/heuristic QA scoring: empathy/professionalism/tone phrases,
// keyword overlap between email and reply (as a stand-in for "relevance"),
// and a handful of exact trigger phrases for each risk flag. Crafted so our
// hand-written "good" and "poor" sample replies score distinctly — a real
// model would judge substance, not string matches.

const EMPATHY_PHRASES = ["sorry", "understand", "appreciate", "apolog", "frustrat"];
const INAPPROPRIATE_PHRASES = ["not our problem", "not our fault", "you should have", "calm down", "obviously"];
const PROFESSIONAL_CLOSING_PHRASES = ["best regards", "sincerely", "thank you", "kind regards"];

const REFUND_PROMISE_PHRASES = ["have issued a refund", "refund has been processed", "you will be refunded", "we will refund", "full refund has been"];
const FIX_CLAIM_PHRASES = ["has been fixed", "is now fixed", "issue is resolved", "we've resolved this", "already fixed"];
const INVENTED_POLICY_PHRASES = ["our policy states", "policy allows", "within 24 hours guaranteed", "standard turnaround is", "as per our"];

const EVAL_STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "had", "you", "your",
  "our", "are", "was", "were", "will", "would", "could", "just", "about", "please", "subject",
  "hello", "dear", "hi", "there",
]);

// Truncating to a 6-character prefix is a crude stand-in for stemming — it's
// enough to match "cancel"/"cancellation" or "charge"/"charged" without a
// real stemming library, which matters because a well-paraphrased reply
// ("forwarded the charge details") shouldn't score as irrelevant just for
// not repeating the email's exact words ("forward the last payment").
function stem(word: string): string {
  return word.slice(0, 6);
}

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !EVAL_STOP_WORDS.has(w))
      .map(stem)
  );
}

function keywordOverlapRatio(email: string, reply: string): number {
  const emailWords = significantWords(email);
  const replyWords = significantWords(reply);
  if (emailWords.size === 0) return 1;
  let overlap = 0;
  emailWords.forEach((w) => {
    if (replyWords.has(w)) overlap += 1;
  });
  return overlap / emailWords.size;
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function looksLikeEvaluatePrompt(prompt: string): boolean {
  return prompt.includes('"scores"') && prompt.includes('"riskFlags"');
}

function mockEvaluate(prompt: string): string {
  const quoted = [...prompt.matchAll(/"""([\s\S]*?)"""/g)].map((m) => m[1]);
  const email = (quoted[0] ?? "").trim();
  const reply = (quoted[1] ?? "").trim();
  const replyLower = reply.toLowerCase();

  const sentiment = prompt.match(/Detected customer sentiment:\s*(\w+)/)?.[1] ?? "Neutral";

  const hasEmpathyPhrase = EMPATHY_PHRASES.some((p) => replyLower.includes(p));
  const hasInappropriatePhrase = INAPPROPRIATE_PHRASES.some((p) => replyLower.includes(p));
  const hasProfessionalClosing = PROFESSIONAL_CLOSING_PHRASES.some((p) => replyLower.includes(p));

  const riskFlags: { type: RiskFlagType; explanation: string }[] = [];

  const refundHit = REFUND_PROMISE_PHRASES.find((p) => replyLower.includes(p));
  if (refundHit) {
    riskFlags.push({
      type: "Unsupported refund promise",
      explanation: `The reply commits to a specific refund action ("${refundHit}") that isn't evidenced or confirmed in the email.`,
    });
  }

  const fixHit = FIX_CLAIM_PHRASES.find((p) => replyLower.includes(p));
  if (fixHit) {
    riskFlags.push({
      type: "Unverified fix claim",
      explanation: `The reply states the issue "${fixHit}" without any evidence of that in the email thread.`,
    });
  }

  const policyHit = INVENTED_POLICY_PHRASES.find((p) => replyLower.includes(p));
  if (policyHit) {
    riskFlags.push({
      type: "Invented policy or fact",
      explanation: `The reply references a specific policy or timeline ("${policyHit}") that isn't established anywhere in the email.`,
    });
  }

  if (hasInappropriatePhrase) {
    riskFlags.push({
      type: "Inappropriate tone",
      explanation: "The reply contains dismissive or blaming language that isn't appropriate for a support interaction.",
    });
  }

  const overlap = keywordOverlapRatio(email, reply);
  const wordCount = reply.split(/\s+/).filter(Boolean).length;

  if (overlap < 0.12 && wordCount > 0) {
    riskFlags.push({
      type: "Ignored customer's question",
      explanation: "The reply shares almost no specific content with the customer's email — it reads as generic rather than addressing what they actually asked.",
    });
  }

  const ignoredQuestion = riskFlags.some((f) => f.type === "Ignored customer's question");
  const hallucinationFlagCount = riskFlags.filter((f) =>
    ["Unsupported refund promise", "Unverified fix claim", "Invented policy or fact"].includes(f.type)
  ).length;

  let toneEmpathy = 7;
  if (hasEmpathyPhrase) toneEmpathy += 2;
  if (sentiment === "Negative" && !hasEmpathyPhrase) toneEmpathy -= 3;
  if (hasInappropriatePhrase) toneEmpathy -= 4;

  let relevance = 2 + overlap * 20;
  if (ignoredQuestion) relevance = Math.min(relevance, 3);

  const completeness = 3 + overlap * 15 + (wordCount > 25 ? 1 : -2);

  const clarity = wordCount < 8 ? 3 : wordCount > 300 ? 5 : 8;

  let professionalism = 8;
  if (hasInappropriatePhrase) professionalism -= 4;
  if (wordCount < 10) professionalism -= 2;
  if (hasProfessionalClosing) professionalism += 1;

  let groundedness = 9;
  groundedness -= hallucinationFlagCount * 4;

  const scores = {
    toneEmpathy: clampScore(toneEmpathy),
    relevance: clampScore(relevance),
    clarity: clampScore(clarity),
    completeness: clampScore(completeness),
    professionalism: clampScore(professionalism),
    groundedness: clampScore(groundedness),
  };

  const strengths = hasEmpathyPhrase
    ? "The reply acknowledges the customer's situation with an empathetic tone and stays on topic."
    : "The reply is polite and concise.";

  const improvements =
    riskFlags.length > 0
      ? "The reply makes claims that aren't backed up by the email — those should be removed or verified before sending."
      : overlap < 0.3
        ? "The reply could reference the customer's specific issue more directly instead of staying generic."
        : "Minor polish only — consider adding a concrete next step or timeframe.";

  const topSuggestion =
    riskFlags.length > 0
      ? `Remove or verify the claim that triggered "${riskFlags[0].type}" before this reply is sent.`
      : "Add one concrete, specific detail tied to the customer's issue.";

  return JSON.stringify({ scores, strengths, improvements, topSuggestion, riskFlags });
}

const mockProvider: AIProvider = {
  name: "mock",
  async complete(prompt: string) {
    if (looksLikeCategorizePrompt(prompt)) {
      return mockCategorize(prompt);
    }
    if (looksLikeSentimentPrompt(prompt)) {
      return mockSentiment(prompt);
    }
    if (looksLikeEvaluatePrompt(prompt)) {
      return mockEvaluate(prompt);
    }
    if (looksLikeGeneratePrompt(prompt)) {
      return mockGenerate(prompt);
    }
    const preview = prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;
    return `[mock output] ${preview}`;
  },
};

/**
 * Selects an AI provider based on the AI_PROVIDER env var. Only "mock" is
 * registered today. Later phases will add real providers (e.g. "anthropic")
 * here without changing any caller.
 */
export function getProvider(): AIProvider {
  const name = process.env.AI_PROVIDER ?? "mock";

  switch (name) {
    case "mock":
    default:
      return mockProvider;
  }
}
