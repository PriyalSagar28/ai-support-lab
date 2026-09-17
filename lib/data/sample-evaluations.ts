import type { Sentiment, Urgency } from "@/lib/ai/sentiment-labels";

export type SampleEvaluation = {
  id: string;
  label: string;
  quality: "good" | "poor";
  email: string;
  reply: string;
  sentiment: Sentiment;
  urgency: Urgency;
};

// Three scenarios, each with a GOOD and a POOR reply to the *same* email —
// so switching between the pair shows exactly what the evaluator is
// rewarding or penalizing, rather than comparing different situations.

const BUG_REPORT_EMAIL = `Subject: Attachments not uploading

Every time I try to attach a PDF to a ticket it fails at 90% with a generic error. I've tried Chrome and Firefox. Can someone look into this? It's blocking my team.`;

const REFUND_EMAIL = `Subject: Please cancel and refund my last payment

I decided to cancel my subscription last week but I was still charged for this month. I won't be using the product going forward, so please refund the last payment in full.`;

const ESCALATION_EMAIL = `Subject: This is the third time I'm writing about this

I have emailed twice already with no response and my issue is still not fixed. My shared inbox stopped syncing new emails since yesterday. I need this resolved today or I'm cancelling.`;

export const sampleEvaluations: SampleEvaluation[] = [
  {
    id: "good-bug-report",
    label: "Good — bug report",
    quality: "good",
    email: BUG_REPORT_EMAIL,
    reply:
      "Hi there,\n\nI'm sorry for the trouble this is causing, especially since it's blocking your team's work. Thank you for the detail about the 90% failure and for testing in both Chrome and Firefox — that helps a lot.\n\nI've escalated this to our engineering team as a priority bug and will update you as soon as I have more information, ideally within the next business day. In the meantime, you're welcome to email attachments directly to our team as a workaround.\n\nBest regards,\nSupport Team",
    sentiment: "Negative",
    urgency: "Medium",
  },
  {
    id: "poor-bug-report",
    label: "Poor — bug report (ignores the issue)",
    quality: "poor",
    email: BUG_REPORT_EMAIL,
    reply: "Hi, thanks for contacting us. We value your business and will get back to you soon. Have a great day!",
    sentiment: "Negative",
    urgency: "Medium",
  },
  {
    id: "good-refund",
    label: "Good — refund request",
    quality: "good",
    email: REFUND_EMAIL,
    reply:
      "Hi there,\n\nThanks for flagging this, and sorry for the confusion around the timing of your cancellation. I've forwarded the charge details to our billing team to review against your cancellation date, and I'll follow up within 2 business days once I have confirmation either way.\n\nBest regards,\nSupport Team",
    sentiment: "Neutral",
    urgency: "Medium",
  },
  {
    id: "poor-refund",
    label: "Poor — refund request (over-promises)",
    quality: "poor",
    email: REFUND_EMAIL,
    reply:
      "Hi, no worries at all — I have issued a refund to your card, you should see it within a day or two. This issue has been fixed on our end already, so it won't happen again. Let me know if there's anything else!",
    sentiment: "Neutral",
    urgency: "Medium",
  },
  {
    id: "good-escalation",
    label: "Good — repeated escalation",
    quality: "good",
    email: ESCALATION_EMAIL,
    reply:
      "Hi, I'm really sorry — I can see this is the third time you've reached out, and that's not the experience we want for you. I've escalated this to our engineering team as a top priority and will personally follow up with an update by end of day today. Thank you for your patience while we get this sorted.\n\nBest regards,\nSupport Team",
    sentiment: "Negative",
    urgency: "High",
  },
  {
    id: "poor-escalation",
    label: "Poor — repeated escalation (blames customer)",
    quality: "poor",
    email: ESCALATION_EMAIL,
    reply:
      "Look, this isn't our fault — you should have reported it sooner. Our policy states we only investigate sync issues reported within 24 hours, so unfortunately we can't help now.",
    sentiment: "Negative",
    urgency: "High",
  },
];
