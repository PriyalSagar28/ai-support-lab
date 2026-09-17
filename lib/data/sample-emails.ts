export type SampleEmail = {
  id: string;
  subject: string;
  body: string;
};

// A small, hand-authored set of support emails used to demo every module
// with the same consistent examples. Real dataset work happens in Phase 1.
export const sampleEmails: SampleEmail[] = [
  {
    id: "billing-double-charge",
    subject: "Charged twice for my subscription",
    body: "Hi, I just noticed two charges of $29 on my card this month for the same Pro plan. Can you please refund one of them? This has happened before and it's frustrating.",
  },
  {
    id: "bug-report",
    subject: "Attachments not uploading",
    body: "Every time I try to attach a PDF to a ticket it fails at 90% with a generic error. I've tried Chrome and Firefox. Can someone look into this? It's blocking my team.",
  },
  {
    id: "feature-request",
    subject: "Can we get dark mode?",
    body: "Loving the product so far! Feature request: could you add a dark mode for the inbox view? My team works late and the bright white background is rough on the eyes. Not urgent, just a suggestion.",
  },
  {
    id: "angry-escalation",
    subject: "This is the third time I'm writing about this",
    body: "I have emailed twice already with no response and my issue is still not fixed. My shared inbox stopped syncing new emails since yesterday. I need this resolved today or I'm cancelling.",
  },
  {
    id: "positive-feedback",
    subject: "Just wanted to say thanks",
    body: "Your support team helped me set up automation rules last week and it saved us hours every day. Just wanted to pass along some appreciation!",
  },
  {
    id: "refund-request",
    subject: "Please cancel and refund my last payment",
    body: "I decided to cancel my subscription last week but I was still charged for this month. I won't be using the product going forward, so please refund the last payment in full.",
  },
  {
    id: "account-locked",
    subject: "Locked out of my account",
    body: "I can't log in anymore — it keeps saying my password is incorrect even after I reset it twice. I need access back today, my whole team is blocked.",
  },
  {
    id: "neutral-inquiry",
    subject: "Question about plan limits",
    body: "Hi, quick question — what's the maximum number of shared inboxes allowed on the team plan? Just comparing options before we decide.",
  },
  {
    id: "urgent-outage",
    subject: "Everything is down — need help ASAP",
    body: "Our shared inbox has been completely down for the last 30 minutes and customers are piling up. This is urgent, we need someone on this right now.",
  },
];

export function formatSampleEmail(sample: SampleEmail): string {
  return `Subject: ${sample.subject}\n\n${sample.body}`;
}
