// Evaluator benchmark: 14 hand-written cases that test lib/ai/evaluate.ts —
// NOT the generation model. Every case fixes the email, the sentiment/
// urgency, the retrieved knowledge chunks, and a deliberately written reply,
// so the evaluator is the only moving part. Run with
// `npm run benchmark:evaluator` (scripts/benchmark-evaluator.ts).
//
// Design:
// - Five customer emails (E-A..E-E), several replies each, so score
//   differences between cases on the same email are attributable to the
//   reply alone (same idea as lib/data/sample-evaluations.ts).
// - Knowledge chunks are FROZEN verbatim copies of chunks from
//   lib/ai/knowledge/knowledge-index.json, with fixed similarity scores. No
//   retrieval happens. If knowledge/*.md changes later, these fixtures
//   deliberately do not follow — the benchmark tests the evaluator, not the
//   knowledge base. E-B passes 5 chunks (more than production's top-3) so
//   every fact its replies use or misuse is actually in context.
// - Emails state elapsed time themselves ("about six weeks ago") because
//   the evaluator has no notion of today's date.
// - Expectations are behavioral checks, not exact scores. Each check is
//   tagged with its backing:
//     "code"   — enforced deterministically by evaluate.ts once the model
//                emits the upstream signal the case targets (e.g. overall
//                <= 4.9 once a critical flag is raised). A failure means the
//                model didn't emit that signal, or the code regressed.
//     "prompt" — depends only on the model following the prompt rubric
//                (relevance cap for generic replies, groundedness cap for a
//                misapplied policy, partly-answered questions, and every
//                "no false positive" expectation).
//   and a severity: "must" checks decide pass/fail; "ideal" checks are
//   reported but never fail a case.

import {
  CRITICAL_RISK_FLAG_TYPES,
  RISK_FLAG_TYPES,
  type RiskFlagType,
} from "../ai/risk-flags";
import type { ScoreDimension } from "../ai/score-dimensions";
import type { Sentiment, Urgency } from "../ai/sentiment-labels";
import type { AnswerStatus } from "../ai/evaluate";
import type { RetrievedChunk } from "../ai/knowledge/types";

// Same thresholds as overallLabel() in app/evaluate/page.tsx and
// app/pipeline/page.tsx (>= 8 ready, >= 5 needs revision).
export const OVERALL_BANDS = ["Ready to send", "Needs revision", "Do not send as-is"] as const;
export type OverallBand = (typeof OVERALL_BANDS)[number];

export function bandFor(score: number): OverallBand {
  if (score >= 8) return "Ready to send";
  if (score >= 5) return "Needs revision";
  return "Do not send as-is";
}

export type CheckBacking = "code" | "prompt";
export type CheckSeverity = "must" | "ideal";

export type BenchmarkCheck = (
  | { kind: "overallMin"; value: number }
  | { kind: "overallMax"; value: number }
  | { kind: "band"; allowed: OverallBand[] }
  | { kind: "flagPresent"; flag: RiskFlagType }
  | { kind: "anyFlagPresent"; flags: RiskFlagType[] }
  | { kind: "flagsAbsent"; flags: RiskFlagType[] }
  | { kind: "dimensionMin"; dimension: ScoreDimension; value: number }
  | { kind: "dimensionMax"; dimension: ScoreDimension; value: number }
  // At least one customer question has one of these statuses.
  | { kind: "questionStatusIncludes"; statuses: AnswerStatus[] }
  // No customer question has any of these statuses.
  | { kind: "questionStatusExcludes"; statuses: AnswerStatus[] }
) & {
  backing: CheckBacking;
  severity: CheckSeverity;
  why: string;
};

export type BenchmarkCase = {
  id: string;
  failureMode: string;
  purpose: string;
  scenario: "E-A" | "E-B" | "E-C" | "E-D" | "E-E";
  email: string;
  sentiment: Sentiment;
  urgency: Urgency;
  retrievedChunks: RetrievedChunk[];
  reply: string;
  // Human-readable summary of the expected outcome; `checks` is what the
  // runner actually asserts.
  expectedSummary: string;
  checks: BenchmarkCheck[];
};

// --- Frozen knowledge chunks --------------------------------------------------

function chunk(id: string, title: string, text: string, score: number): RetrievedChunk {
  return { id, source: id.split("#")[0], title, text, score };
}

const BILLING_CHARGED_TWICE = chunk(
  "billing-faq.md#1",
  "Billing FAQ",
  "Why was I charged twice this month?\n\nThis is almost always one of two things: a plan upgrade (which charges a\nprorated amount in addition to your regular renewal) or a genuine billing\nerror. Check Settings > Billing > Invoice History first — if you see two\ncharges of the same amount on the same day with no plan change, that's a\nduplicate charge. See `refund-policy.md` for how duplicate charges are\nrefunded.",
  0.84
);

const REFUND_ELIGIBILITY = chunk(
  "refund-policy.md#0",
  "Refund Policy",
  "Eligibility window\n\nCharges are eligible for a full refund if the refund request is made within\n14 days of the charge date. This applies to both monthly and annual billing\ncycles — for annual plans, the 14-day window starts from the most recent\nrenewal charge, not the original signup date.",
  0.83
);

const REFUND_AFTER_CANCELLATION = chunk(
  "refund-policy.md#1",
  "Refund Policy",
  "Refunds after cancellation\n\nIf you cancel your subscription but are charged again before the\ncancellation takes effect (for example, a renewal that processed moments\nbefore you cancelled), that charge is refunded automatically within 5\nbusiness days. You do not need to contact support for this case. See\n`cancellation-policy.md` for how cancellation timing works.",
  0.79
);

const REFUND_DUPLICATE = chunk(
  "refund-policy.md#2",
  "Refund Policy",
  "Duplicate or billing-error charges\n\nDuplicate charges caused by a billing system error are refunded in full\nregardless of the 14-day window, as soon as the duplicate is confirmed.\nContact support with the charge dates and amounts so the team can verify\nthe duplicate before issuing the refund.",
  0.81
);

const REFUND_NOT_REFUNDABLE = chunk(
  "refund-policy.md#3",
  "Refund Policy",
  "What is not refundable\n\nCharges older than 14 days are not refundable, except for the duplicate or\nbilling-error case above. Partial-month usage is not prorated for refund\npurposes — refunds are issued for the full charge amount or not at all.",
  0.8
);

const REFUND_HOW_TO_REQUEST = chunk(
  "refund-policy.md#4",
  "Refund Policy",
  "How to request a refund\n\nEmail support with your account email and the date of the charge you're\ndisputing. Most requests are resolved within 1 business day; approved\nrefunds are returned to the original payment method within 5-10 business\ndays, depending on your bank.",
  0.76
);

const CANCELLATION_HOW_TO = chunk(
  "cancellation-policy.md#0",
  "Cancellation Policy",
  "How to cancel\n\nGo to Settings > Billing > Cancel Subscription and confirm. Cancellation\ntakes effect immediately in the sense that no future charges are\nscheduled, but your plan features remain active until the end of the\ncurrent billing period.",
  0.78
);

const CANCELLATION_DATA = chunk(
  "cancellation-policy.md#2",
  "Cancellation Policy",
  "What happens to your data\n\nYour account data (tickets, automation rules, integration connections) is\nretained for 30 days after the billing period ends, in case you want to\nreactivate. After 30 days of inactivity on a cancelled account, the data\nis permanently deleted and cannot be recovered.",
  0.74
);

const TROUBLESHOOTING_CRASHING = chunk(
  "troubleshooting.md#0",
  "Troubleshooting",
  "The application keeps crashing or freezing\n\nFirst, check the status page for any ongoing incident — most sudden,\nwidespread crashes are on our end, not yours. If the status page is\nclear: clear your browser cache, make sure your browser is updated to\nthe latest version, and try disabling browser extensions one at a time,\nsince ad blockers and privacy extensions are the most common cause of\nthis symptom.",
  0.66
);

const TROUBLESHOOTING_SYNC = chunk(
  "troubleshooting.md#2",
  "Troubleshooting",
  "Shared inbox isn't syncing new emails\n\nFirst check Settings > Integrations to confirm the email connection\nstill shows \"Connected\" — integrations occasionally need to be\nreauthorized after the email provider revokes access (common after a\npassword change on the connected mailbox). New emails can also take up\nto 15 minutes to appear during normal sync delay, which is expected\nbehavior, not a fault.",
  0.86
);

const TROUBLESHOOTING_GENERAL = chunk(
  "troubleshooting.md#4",
  "Troubleshooting",
  "General steps before contacting support\n\nNote the exact error message if one appears, the browser and OS you're\nusing, and roughly when the issue started. Including these details in\nyour first message to support significantly speeds up resolution.",
  0.64
);

const PLANS_PRO = chunk(
  "subscription-plans.md#1",
  "Subscription Plans",
  "Pro — $29/month\n\nFor small support teams. Includes up to 5 user seats, unlimited tickets,\na shared inbox with automation rules, and priority support with same-day\nresponse. This is the most popular plan.",
  0.77
);

const PLANS_BUSINESS = chunk(
  "subscription-plans.md#2",
  "Subscription Plans",
  "Business — $79/month\n\nFor growing teams that need more control. Includes up to 20 user seats,\neverything in Pro, advanced automation rules, single sign-on (SSO), and a\ndedicated account manager.",
  0.79
);

const PLANS_CHANGING = chunk(
  "subscription-plans.md#4",
  "Subscription Plans",
  "Changing plans\n\nUpgrading takes effect immediately and you're charged a prorated amount\nfor the rest of the current billing period. Downgrading takes effect at\nthe start of your next billing period — you keep your current plan's\nfeatures until then, and there is no partial refund for downgrading\nmid-period.",
  0.85
);

// --- Scenarios ---------------------------------------------------------------

// E-A: duplicate charge, customer gives no dates/amounts. Asks: refund the
// extra charge; how long it takes.
const EMAIL_A = `Subject: Charged twice this month?

Hi, I think I got charged twice this month for my subscription. I didn't change my plan or add anything. Can you refund the extra charge? And how long will it take to show up on my card?`;
const CHUNKS_A = [BILLING_CHARGED_TWICE, REFUND_DUPLICATE, REFUND_HOW_TO_REQUEST];

// E-B: annual renewal ~42 days ago, never cancelled. Correct answer: NO
// refund (outside the 14-day window from the renewal charge, not a
// duplicate). Asks: refund; cancel; what happens to data.
const EMAIL_B = `Subject: Refund my annual renewal and cancel

My annual Pro plan auto-renewed about six weeks ago and I was charged $278.40. I forgot to cancel before it renewed and I don't use the product anymore. Please refund that charge and cancel my account. Also, what happens to my data once I cancel?`;
const CHUNKS_B = [
  REFUND_ELIGIBILITY,
  REFUND_NOT_REFUNDABLE,
  REFUND_AFTER_CANCELLATION,
  CANCELLATION_HOW_TO,
  CANCELLATION_DATA,
];

// E-C: shared inbox not syncing, third contact, angry. Ask: fix the sync.
const EMAIL_C = `Subject: Third time writing — inbox still not syncing

This is the third time I'm writing about this. Our shared inbox hasn't pulled in any new emails since yesterday, and my team is missing customer messages. Fix this today.`;
const CHUNKS_C = [TROUBLESHOOTING_SYNC, TROUBLESHOOTING_CRASHING, TROUBLESHOOTING_GENERAL];

// E-D: downgrade Business -> Pro. Asks: when it takes effect; partial
// refund; losing SSO.
const EMAIL_D = `Subject: Downgrading from Business to Pro

Hi, we're currently on the Business plan and want to move to Pro. When does the downgrade take effect? Do we get a partial refund for the rest of this month? And will we lose SSO?`;
const CHUNKS_D = [PLANS_CHANGING, PLANS_PRO, PLANS_BUSINESS];

// E-E: asks about something the knowledge base never addresses (a cap on
// automation rules) next to something it does (what the next plan up adds).
// The chunks describe Pro's features and even say "unlimited tickets", so a
// confident "no cap" answer is a plausible-sounding inference from silence
// — the failure mode these cases target — not a contradiction of the text.
const EMAIL_E = `Subject: Automation rule limits on Pro

Hi, we're on the Pro plan and about to build out our workflows. Is there a cap on how many automation rules we can create? And if we outgrow Pro, what does the next plan up add?`;
const CHUNKS_E = [PLANS_PRO, PLANS_BUSINESS, PLANS_CHANGING];

const GOOD_DOWNGRADE_REPLY = `Hi there,

Thanks for checking before you switch — happy to walk you through it.

- Timing: a downgrade takes effect at the start of your next billing period. You keep all your Business features until then.
- Refund: there's no partial refund for downgrading mid-period. Since you keep Business features for the rest of the period you've already paid for, the change simply applies from your next bill.
- SSO: single sign-on is a Business plan feature and isn't included in Pro, so you'll lose SSO once the downgrade takes effect. One more thing to plan for: Pro includes up to 5 user seats, compared with up to 20 on Business.

Let me know if you'd like help with anything else before you switch.

Best regards,
Support Team`;

// --- Shared checks -------------------------------------------------------------

const NO_CRITICAL_FLAGS: BenchmarkCheck = {
  kind: "flagsAbsent",
  flags: CRITICAL_RISK_FLAG_TYPES,
  backing: "prompt",
  severity: "must",
  why: "Reply makes no fabricated claim; any critical flag is a false positive.",
};

const NO_FLAGS_AT_ALL: BenchmarkCheck = {
  kind: "flagsAbsent",
  flags: [...RISK_FLAG_TYPES],
  backing: "prompt",
  severity: "must",
  why: "Reply is correct, complete and well-toned; any flag is a false positive.",
};

function criticalCaps(why: string): BenchmarkCheck[] {
  return [
    { kind: "dimensionMax", dimension: "groundedness", value: 4, backing: "code", severity: "must", why: `Code caps groundedness at 4 once a critical flag is raised (${why}).` },
    { kind: "overallMax", value: 4.9, backing: "code", severity: "must", why: `Code caps overall at 4.9 once a critical flag is raised (${why}).` },
    { kind: "band", allowed: ["Do not send as-is"], backing: "code", severity: "must", why: "Follows from the 4.9 critical-flag cap." },
  ];
}

// --- Cases -----------------------------------------------------------------

export const evaluatorBenchmark: BenchmarkCase[] = [
  {
    id: "BM-01",
    failureMode: "None — genuinely good grounded reply",
    purpose:
      "Ceiling anchor. Also checks that a correct 'no partial refund' statement from the knowledge base is not mistaken for an invented refund fact.",
    scenario: "E-D",
    email: EMAIL_D,
    sentiment: "Neutral",
    urgency: "Low",
    retrievedChunks: CHUNKS_D,
    reply: GOOD_DOWNGRADE_REPLY,
    expectedSummary: "All 3 questions answered, no flags, overall 8.0–9.2 (Ready to send), groundedness >= 8.",
    checks: [
      NO_FLAGS_AT_ALL,
      { kind: "questionStatusExcludes", statuses: ["unanswered", "partly answered"], backing: "prompt", severity: "must", why: "All three questions are answered explicitly." },
      { kind: "dimensionMin", dimension: "groundedness", value: 8, backing: "prompt", severity: "must", why: "Every claim matches the retrieved chunks." },
      { kind: "overallMin", value: 8.0, backing: "prompt", severity: "must", why: "A sendable, complete, grounded reply." },
      { kind: "overallMax", value: 9.2, backing: "prompt", severity: "must", why: "Rubric reserves 10 for rare exemplary replies; above 9.2 suggests inflation." },
      { kind: "band", allowed: ["Ready to send"], backing: "prompt", severity: "must", why: "Follows from overall >= 8." },
    ],
  },
  {
    id: "BM-02",
    failureMode: "Grounded but incomplete (partly answered)",
    purpose:
      "Exercises the 'partly answered' path, which has NO code cap — only the prompt keeps completeness down. Distinguishes thin answers from ignored questions.",
    scenario: "E-D",
    email: EMAIL_D,
    sentiment: "Neutral",
    urgency: "Low",
    retrievedChunks: CHUNKS_D,
    reply: `Hi there,

Downgrades don't happen straight away — they apply from your next billing cycle. Refunds aren't available in this case. Some Business features, like SSO, may work differently on Pro.

Best regards,
Support Team`,
    expectedSummary:
      "At least one question 'partly answered' (acceptable variant: SSO marked 'unanswered' + ignored flag), completeness <= 7, no critical flags, overall 5.5–7.9 (Needs revision).",
    checks: [
      { kind: "questionStatusIncludes", statuses: ["partly answered", "unanswered"], backing: "prompt", severity: "must", why: "The SSO answer ('may work differently') dodges the question." },
      { kind: "questionStatusIncludes", statuses: ["partly answered"], backing: "prompt", severity: "ideal", why: "Ideal classification is 'partly answered', not 'unanswered'." },
      { kind: "dimensionMax", dimension: "completeness", value: 7, backing: "prompt", severity: "must", why: "Omits keeping features until the period ends and gives a vague SSO answer." },
      NO_CRITICAL_FLAGS,
      { kind: "overallMin", value: 5.5, backing: "prompt", severity: "must", why: "Everything stated is true; this is a polish gap, not a failure." },
      { kind: "overallMax", value: 7.9, backing: "prompt", severity: "must", why: "Incomplete replies must not read as sendable." },
      { kind: "band", allowed: ["Needs revision"], backing: "prompt", severity: "must", why: "Follows from 5.5–7.4." },
    ],
  },
  {
    id: "BM-03",
    failureMode: "Grounded but irrelevant/generic",
    purpose:
      "Every sentence is from the knowledge base, but it ignores the sync-specific chunk and the repeated contact. Tests the PROMPT-ONLY relevance <= 5 limit, and that 'grounded' does not mean 'good'.",
    scenario: "E-C",
    email: EMAIL_C,
    sentiment: "Negative",
    urgency: "High",
    retrievedChunks: CHUNKS_C,
    reply: `Hi there,

Thanks for reaching out! To help us look into any issue, please note the exact error message if one appears, the browser and OS you're using, and roughly when the issue started. In the meantime, it's worth checking our status page for any ongoing incident, clearing your browser cache, and making sure your browser is updated to the latest version.

Best regards,
Support Team`,
    expectedSummary:
      "Relevance <= 5, ignored-question flag likely (groundedness >= 7 and no critical flags are informational), overall <= 6.5 (not Ready).",
    checks: [
      { kind: "dimensionMax", dimension: "relevance", value: 5, backing: "prompt", severity: "must", why: "Prompt hard limit: generic answer that ignores the customer's situation." },
      { kind: "dimensionMin", dimension: "groundedness", value: 7, backing: "prompt", severity: "ideal", why: "All statements are supported by retrieved chunks. Informational: the evaluator may treat generic advice as a real policy applied to the wrong situation, which the prompt caps at groundedness 6." },
      { ...NO_CRITICAL_FLAGS, severity: "ideal", why: "No fabricated claim. Informational: the evaluator sometimes flags off-topic real advice as 'Invented policy or fact'." },
      { kind: "flagPresent", flag: "Ignored customer's question", backing: "prompt", severity: "ideal", why: "The actual sync problem is never addressed." },
      { kind: "overallMax", value: 6.5, backing: "code", severity: "must", why: "Code: overall <= weakest dimension + 1.5, so relevance <= 5 implies <= 6.5." },
      { kind: "band", allowed: ["Needs revision", "Do not send as-is"], backing: "code", severity: "must", why: "Follows from overall <= 6.5." },
    ],
  },
  {
    id: "BM-04",
    failureMode: "Ignored customer's question",
    purpose:
      "An otherwise excellent reply that never mentions the refund — the customer's main request. Tests that polish elsewhere doesn't hide the gap; the downstream caps are code-enforced.",
    scenario: "E-B",
    email: EMAIL_B,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_B,
    reply: `Hi there,

Thank you for letting us know, and I'm sorry to see you go. You can cancel at any time from Settings > Billing > Cancel Subscription — once you confirm, no future charges will be scheduled, and your plan features stay active until the end of your current billing period.

As for your data: your tickets, automation rules and integration connections are kept for 30 days after the billing period ends, in case you change your mind and want to reactivate. After those 30 days, the data is permanently deleted and can't be recovered.

Thanks again for being a customer.

Best regards,
Support Team`,
    expectedSummary:
      "Refund question 'unanswered', 'Ignored customer's question' flag, completeness <= 5, overall 5.0–6.9, no critical flags.",
    checks: [
      { kind: "questionStatusIncludes", statuses: ["unanswered"], backing: "prompt", severity: "must", why: "The refund request is never mentioned." },
      { kind: "flagPresent", flag: "Ignored customer's question", backing: "code", severity: "must", why: "Code adds this flag whenever any question is 'unanswered'." },
      { kind: "dimensionMax", dimension: "completeness", value: 5, backing: "code", severity: "must", why: "Code caps completeness at 5 with the ignored-question flag." },
      { kind: "overallMax", value: 6.9, backing: "code", severity: "must", why: "Code caps overall at 6.9 for a major flag." },
      NO_CRITICAL_FLAGS,
      { kind: "overallMin", value: 5.0, backing: "prompt", severity: "must", why: "The parts it does answer are correct and well written." },
      { kind: "band", allowed: ["Needs revision"], backing: "prompt", severity: "must", why: "Follows from 5.0–6.9." },
    ],
  },
  {
    id: "BM-05",
    failureMode: "Invented company policy",
    purpose: "A plausible-sounding fabricated '50% within 60 days' courtesy policy with a precise dollar figure.",
    scenario: "E-B",
    email: EMAIL_B,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_B,
    reply: `Hi there,

I'm sorry you were caught out by the renewal. Good news: as a one-time courtesy, we refund 50% of annual plans that are cancelled within 60 days of renewal, so you qualify for a $139.20 refund. Once you cancel from Settings > Billing > Cancel Subscription, I'll process the partial refund and it will be back on your card within 5-10 business days.

Your data is kept for 30 days after your billing period ends, then permanently deleted.

Best regards,
Support Team`,
    expectedSummary:
      "'Invented policy or fact' (likely also 'Unsupported refund promise'), groundedness <= 4, overall <= 4.9 (Do not send).",
    checks: [
      { kind: "flagPresent", flag: "Invented policy or fact", backing: "prompt", severity: "must", why: "The 50%/60-day courtesy policy exists in neither source." },
      { kind: "flagPresent", flag: "Unsupported refund promise", backing: "prompt", severity: "ideal", why: "It also promises a refund the policy doesn't allow." },
      ...criticalCaps("invented policy"),
    ],
  },
  {
    id: "BM-06",
    failureMode: "Incorrect application of a real policy",
    purpose:
      "Applies the REAL refunds-after-cancellation policy to a customer who never cancelled. Hardest case: every phrase matches the knowledge base, there is no dedicated flag type, and the groundedness <= 6 limit is prompt-only.",
    scenario: "E-B",
    email: EMAIL_B,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_B,
    reply: `Hi there,

Thanks for reaching out, and sorry for the hassle. Because your renewal was charged before your cancellation took effect, it qualifies under our refunds-after-cancellation policy: the $278.40 charge will be refunded automatically within 5 business days, so there's nothing more you need to do. To cancel, go to Settings > Billing > Cancel Subscription and confirm.

Your account data is retained for 30 days after the billing period ends in case you want to reactivate; after that it's permanently deleted.

Best regards,
Support Team`,
    expectedSummary:
      "Groundedness <= 6; ideally 'Unsupported refund promise' (-> overall <= 4.9). Minimum pass: overall < 7.0. A 7.0–7.9 score with no flag is a documented evaluator weakness (no flag type and no code cap for misapplied policy).",
    checks: [
      { kind: "dimensionMax", dimension: "groundedness", value: 6, backing: "prompt", severity: "must", why: "Prompt hard limit: real policy applied incorrectly to the customer's situation." },
      { kind: "overallMax", value: 6.9, backing: "prompt", severity: "must", why: "Minimum pass: a wrong refund promise must never approach 'Ready to send'." },
      { kind: "band", allowed: ["Needs revision", "Do not send as-is"], backing: "prompt", severity: "must", why: "Must not be 'Ready to send'." },
      { kind: "anyFlagPresent", flags: ["Unsupported refund promise", "Invented policy or fact"], backing: "prompt", severity: "ideal", why: "The refund is not supported for this customer's situation." },
      { kind: "overallMax", value: 4.9, backing: "code", severity: "ideal", why: "Would follow from the critical flag above via the code cap." },
    ],
  },
  {
    id: "BM-07",
    failureMode: "None — good grounded refusal",
    purpose:
      "A correct, empathetic 'no'. Tests three false positives: penalizing a policy-correct refusal to an upset customer, treating a declined refund as an ignored question, and capping relevance for 'redirecting' to Settings.",
    scenario: "E-B",
    email: EMAIL_B,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_B,
    reply: `Hi there,

I'm sorry the renewal caught you by surprise — I know that's frustrating when you're no longer using the product. I've checked this against our refund policy, and unfortunately I'm not able to refund this charge. Refunds are available within 14 days of the charge date, and for annual plans that window starts from the most recent renewal charge. Your renewal was about six weeks ago, so it falls outside that window, and it isn't a duplicate or billing-error charge, which is the only exception.

To cancel, go to Settings > Billing > Cancel Subscription and confirm. No future charges will be scheduled after that, and your plan features stay active until the end of the billing period you've already paid for.

Your data (tickets, automation rules and integration connections) is retained for 30 days after the billing period ends, in case you decide to reactivate. After that it's permanently deleted and can't be recovered.

Best regards,
Support Team`,
    expectedSummary: "All questions answered, no flags, relevance >= 7, overall 7.5–9.0.",
    checks: [
      NO_FLAGS_AT_ALL,
      { kind: "questionStatusExcludes", statuses: ["unanswered"], backing: "prompt", severity: "must", why: "The refund is explicitly declined with the reason — declined is not ignored." },
      { kind: "dimensionMin", dimension: "relevance", value: 7, backing: "prompt", severity: "must", why: "Pointing to Settings to cancel is the documented procedure, not a generic redirect." },
      { kind: "overallMin", value: 7.5, backing: "prompt", severity: "must", why: "Correct, complete, grounded and empathetic." },
      { kind: "overallMax", value: 9.0, backing: "prompt", severity: "must", why: "Guards against inflation." },
      { kind: "band", allowed: ["Ready to send", "Needs revision"], backing: "prompt", severity: "must", why: "Follows from 7.5–9.0." },
    ],
  },
  {
    id: "BM-08",
    failureMode: "Unsupported promise",
    purpose:
      "Claims an unverified refund was already issued, with a timeline contradicting the knowledge base, plus an invented fix. Pairs with BM-09 (same email, conditional grounded refund).",
    scenario: "E-A",
    email: EMAIL_A,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_A,
    reply: `Hi there,

So sorry about the double charge! I've already refunded the duplicate payment to your card, and you'll see it back within 24 hours. I've also fixed the billing glitch that caused it on our end, so this won't happen again.

Best regards,
Support Team`,
    expectedSummary:
      "'Unsupported refund promise' and 'Unverified fix claim', groundedness <= 4, overall <= 4.9 (Do not send).",
    checks: [
      { kind: "flagPresent", flag: "Unsupported refund promise", backing: "prompt", severity: "must", why: "Duplicate unverified; 24h contradicts 5-10 business days." },
      { kind: "flagPresent", flag: "Unverified fix claim", backing: "prompt", severity: "must", why: "Claims a billing glitch was fixed with no basis." },
      ...criticalCaps("unsupported promise"),
    ],
  },
  {
    id: "BM-09",
    failureMode: "None — missing customer information handled correctly",
    purpose:
      "Explains the grounded duplicate-charge policy and asks for the charge dates/amounts the policy requires. Tests that asking for information isn't treated as stalling or ignoring, and that a conditional grounded refund isn't flagged.",
    scenario: "E-A",
    email: EMAIL_A,
    sentiment: "Negative",
    urgency: "Medium",
    retrievedChunks: CHUNKS_A,
    reply: `Hi there,

I'm sorry for the worry — an unexpected second charge is never fun to see. You can confirm what happened under Settings > Billing > Invoice History: if you see two charges of the same amount on the same day with no plan change, that's a duplicate charge.

Duplicate charges caused by a billing error are refunded in full, regardless of our usual 14-day refund window, as soon as we confirm the duplicate. To verify it, could you reply with the dates and amounts of both charges? Once the refund is approved, it's returned to your original payment method within 5-10 business days, depending on your bank.

Best regards,
Support Team`,
    expectedSummary:
      "No flags, completeness >= 7, refund question 'answered' or 'partly answered' (never 'unanswered'), overall 7.5–9.0.",
    checks: [
      NO_FLAGS_AT_ALL,
      { kind: "questionStatusExcludes", statuses: ["unanswered"], backing: "prompt", severity: "must", why: "Both questions are addressed; the refund is correctly conditional on verification." },
      { kind: "dimensionMin", dimension: "completeness", value: 7, backing: "prompt", severity: "must", why: "Asking for policy-required info is the complete answer here." },
      { kind: "overallMin", value: 7.5, backing: "prompt", severity: "must", why: "Correct handling of missing information." },
      { kind: "overallMax", value: 9.0, backing: "prompt", severity: "must", why: "Guards against inflation." },
      { kind: "band", allowed: ["Ready to send", "Needs revision"], backing: "prompt", severity: "must", why: "Follows from 7.5–9.0." },
    ],
  },
  {
    id: "BM-10",
    failureMode: "Inappropriate tone",
    purpose:
      "Correct, grounded fix delivered condescendingly. Contains no false claims, so tone is tested in isolation from content.",
    scenario: "E-C",
    email: EMAIL_C,
    sentiment: "Negative",
    urgency: "High",
    retrievedChunks: CHUNKS_C,
    reply: `Honestly, emailing three times won't make this go any faster. This is basic setup. Go to Settings > Integrations and check whether your email connection still says "Connected" — if it doesn't, reauthorize it, which is usually needed after someone changes the password on the connected mailbox. Also, new emails can take up to 15 minutes to show up, which is normal, so please don't report that as a fault. That should sort it.`,
    expectedSummary:
      "'Inappropriate tone' flag, toneEmpathy <= 3, professionalism <= 4, groundedness >= 7, no critical flags, overall 2.0–5.5.",
    checks: [
      { kind: "flagPresent", flag: "Inappropriate tone", backing: "prompt", severity: "must", why: "Dismissive, condescending wording toward an upset customer." },
      { kind: "dimensionMax", dimension: "toneEmpathy", value: 3, backing: "prompt", severity: "must", why: "No empathy; actively dismissive." },
      { kind: "dimensionMax", dimension: "professionalism", value: 4, backing: "prompt", severity: "must", why: "'This is basic setup' is unprofessional." },
      { kind: "dimensionMin", dimension: "groundedness", value: 7, backing: "prompt", severity: "must", why: "The technical content matches the sync chunk." },
      NO_CRITICAL_FLAGS,
      { kind: "overallMax", value: 6.9, backing: "code", severity: "must", why: "Code caps overall at 6.9 for a major flag." },
      { kind: "overallMin", value: 2.0, backing: "prompt", severity: "must", why: "The fix itself is correct; tone/professionalism of 1 legitimately pulls overall to 2.5 via the weakest-dimension rule." },
      { kind: "overallMax", value: 5.5, backing: "prompt", severity: "must", why: "Weakest-dimension rule with tone <= 3-4 should pull it here." },
    ],
  },
  {
    id: "BM-11",
    failureMode: "None — good reply to angry escalation",
    purpose:
      "Positive counterpart to BM-03 and BM-10 on the same email. Also checks that an agent's own follow-up commitment ('I'll check back by end of day') is not flagged as an unsupported company promise.",
    scenario: "E-C",
    email: EMAIL_C,
    sentiment: "Negative",
    urgency: "High",
    retrievedChunks: CHUNKS_C,
    reply: `Hi there,

I'm really sorry — I can see this is the third time you've had to write to us, and with your team missing customer messages, I understand why you need this fixed today.

The most common cause of a shared inbox that stops receiving new emails is the email integration losing access. Please go to Settings > Integrations and check whether your email connection still shows "Connected". If it doesn't, reauthorize it — this is often needed after the password on the connected mailbox has been changed. Once it's reconnected, new emails can take up to 15 minutes to appear, which is normal sync delay.

If the connection already shows "Connected", reply with roughly when the syncing stopped and any error message you see, and I'll check back with you by end of day today.

Best regards,
Support Team`,
    expectedSummary: "No critical flags, overall 7.5–9.0.",
    checks: [
      NO_CRITICAL_FLAGS,
      { kind: "flagsAbsent", flags: ["Inappropriate tone", "Ignored customer's question"], backing: "prompt", severity: "ideal", why: "Empathetic and addresses the sync issue directly." },
      { kind: "overallMin", value: 7.5, backing: "prompt", severity: "must", why: "Relevant, grounded, empathetic escalation handling." },
      { kind: "overallMax", value: 9.0, backing: "prompt", severity: "must", why: "Guards against inflation." },
      { kind: "band", allowed: ["Ready to send", "Needs revision"], backing: "prompt", severity: "must", why: "Follows from 7.5–9.0." },
    ],
  },
  {
    id: "BM-12",
    failureMode: "Context control — correct facts, NO retrieved context",
    purpose:
      "Same reply as BM-01 with zero chunks. Proves grounding is judged against the supplied context, not the model's world knowledge. If it scores like BM-01, the evaluator is ignoring the context.",
    scenario: "E-D",
    email: EMAIL_D,
    sentiment: "Neutral",
    urgency: "Low",
    retrievedChunks: [],
    reply: GOOD_DOWNGRADE_REPLY,
    expectedSummary: "'Invented policy or fact', groundedness <= 4, overall <= 4.9 (Do not send).",
    checks: [
      { kind: "flagPresent", flag: "Invented policy or fact", backing: "prompt", severity: "must", why: "Billing-period, refund, SSO and seat claims are unsupported by the email alone." },
      ...criticalCaps("no context to ground the claims"),
    ],
  },
  {
    id: "BM-13",
    failureMode: "Unsupported claim about an undocumented policy",
    purpose:
      "The customer asks about a limit the knowledge base never mentions. The reply confidently asserts there is no limit, wrapped in otherwise accurate plan facts. Tests that silence in the knowledge base is not treated as support for a company-specific claim — the unflagged 'no limit' inference is the failure this case guards against.",
    scenario: "E-E",
    email: EMAIL_E,
    sentiment: "Neutral",
    urgency: "Low",
    retrievedChunks: CHUNKS_E,
    reply: `Hi there,

Great question — good to hear you're building out your workflows.

There's no cap on the number of automation rules on the Pro plan, so you can create as many as your workflows need. Like tickets, automation rules are unlimited on Pro.

If you outgrow Pro, the next plan up is Business at $79/month. It includes everything in Pro plus advanced automation rules, single sign-on (SSO), up to 20 user seats (compared with 5 on Pro), and a dedicated account manager. Upgrading takes effect immediately, and you're charged a prorated amount for the rest of the current billing period.

Let me know if you have any other questions.

Best regards,
Support Team`,
    expectedSummary:
      "'Invented policy or fact', groundedness <= 4, overall <= 4.9 (Do not send). The 'no cap' claim has no support in the email or knowledge base.",
    checks: [
      { kind: "flagPresent", flag: "Invented policy or fact", backing: "prompt", severity: "must", why: "The knowledge base never mentions an automation-rule limit, so 'no cap' / 'unlimited' is an invented policy." },
      ...criticalCaps("unsupported claim about an undocumented limit"),
    ],
  },
  {
    id: "BM-14",
    failureMode: "None — honest answer when the policy is undocumented",
    purpose:
      "Counterpart to BM-13 on the same email. Says the limit isn't documented instead of guessing, and answers the documented question fully. Tests that the stricter claim check doesn't penalize an honest 'I can't confirm that' or treat it as ignoring the question.",
    scenario: "E-E",
    email: EMAIL_E,
    sentiment: "Neutral",
    urgency: "Low",
    retrievedChunks: CHUNKS_E,
    reply: `Hi there,

Thanks for checking before you build — that's a sensible time to ask.

On automation rules: our plan documentation confirms that Pro includes a shared inbox with automation rules, but it doesn't state a maximum number of rules, so I don't want to give you a figure I can't confirm. I'll check with the team and follow up with a definite answer.

If you outgrow Pro, the next plan up is Business at $79/month. It includes everything in Pro plus advanced automation rules, single sign-on (SSO), up to 20 user seats (compared with 5 on Pro), and a dedicated account manager. Upgrading takes effect immediately, and you're charged a prorated amount for the rest of the current billing period.

Best regards,
Support Team`,
    expectedSummary:
      "No critical flags, groundedness >= 8, no question 'unanswered' (the limit question may be 'partly answered'), overall 7.0–9.0.",
    checks: [
      NO_CRITICAL_FLAGS,
      { kind: "dimensionMin", dimension: "groundedness", value: 8, backing: "prompt", severity: "must", why: "Every company fact is in the chunks; saying the limit isn't documented is not a claim about the limit." },
      { kind: "questionStatusExcludes", statuses: ["unanswered"], backing: "prompt", severity: "must", why: "The limit question is addressed honestly, not ignored." },
      { kind: "overallMin", value: 7.0, backing: "prompt", severity: "must", why: "Correct, grounded handling of missing information." },
      { kind: "overallMax", value: 9.0, backing: "prompt", severity: "must", why: "Guards against inflation." },
      { kind: "band", allowed: ["Ready to send", "Needs revision"], backing: "prompt", severity: "must", why: "Follows from 7.0–9.0." },
    ],
  },
];
