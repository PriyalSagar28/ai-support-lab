// Five scenarios for the end-to-end pipeline demo, styled like inbox
// tickets (from/subject/body) rather than bare email strings. Chosen to
// spread across the sentiment/urgency space: a neutral billing issue, a
// high-urgency outage, a low-urgency feature request, a negative/high
// escalation, and a positive note.

export type PipelineSample = {
  id: string;
  label: string;
  from: string;
  subject: string;
  body: string;
};

export const pipelineSamples: PipelineSample[] = [
  {
    id: "refund-billing",
    label: "Refund / billing issue",
    from: "Priya N.",
    subject: "Please cancel and refund my last payment",
    body: "I decided to cancel my subscription last week but I was still charged for this month. I won't be using the product going forward, so please refund the last payment in full.",
  },
  {
    id: "bug-outage",
    label: "Bug / outage",
    from: "Marcus T.",
    subject: "Everything is down — need help ASAP",
    body: "Our shared inbox has been completely down for the last 30 minutes and customers are piling up. This is urgent, we need someone on this right now.",
  },
  {
    id: "feature-request",
    label: "Feature request",
    from: "Alicia W.",
    subject: "Can we get dark mode?",
    body: "Loving the product so far! Feature request: could you add a dark mode for the inbox view? My team works late and the bright white background is rough on the eyes. Not urgent, just a suggestion.",
  },
  {
    id: "repeated-escalation",
    label: "Repeated escalation",
    from: "David K.",
    subject: "This is the third time I'm writing about this",
    body: "I have emailed twice already with no response and my issue is still not fixed. My shared inbox stopped syncing new emails since yesterday. I need this resolved today or I'm cancelling.",
  },
  {
    id: "positive-inquiry",
    label: "Positive / general inquiry",
    from: "Jordan L.",
    subject: "Just wanted to say thanks",
    body: "Your support team helped me set up automation rules last week and it saved us hours every day. Just wanted to pass along some appreciation!",
  },
];
