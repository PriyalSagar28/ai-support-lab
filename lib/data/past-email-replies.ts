import type { Category } from "../ai/categories";

export type PastEmailReply = {
  id: string;
  category: Category;
  // "Subject: ...\n\nbody", the same shape the pipeline and batch script
  // pass to generateReply(), so example emails and incoming emails embed
  // comparably.
  email: string;
  response: string;
};

// Past support emails paired with the reply support sent. SYNTHETIC: every
// record was hand-authored for this project — none is a real customer email
// or a reply that was actually sent. They model the scenarios the app
// handles and are written to agree with knowledge/*.md.
//
// Retrieved as few-shot examples of HOW to reply (lib/ai/generate.ts); the
// knowledge base stays the source of truth for WHAT facts to state.
//
// Deliberately distinct from the 9 evaluation emails in sample-emails.ts, so
// the batch evaluation never retrieves an answer to its own test email.
// Rebuild the embedding index after editing: npm run index:examples
export const pastEmailReplies: PastEmailReply[] = [
  {
    id: "billing-upgrade-proration",
    category: "Billing",
    email:
      "Subject: Why is this month's bill higher?\n\nWe usually pay $29 a month but this month there's an extra charge on our card. We did move from Pro to Business about two weeks ago — is that related?",
    response:
      "Hi there,\n\nThanks for checking before assuming the worst — yes, that extra charge is almost certainly from your upgrade. When you move to a higher plan, the upgrade takes effect immediately and you're charged a prorated amount for the rest of the current billing period, in addition to your regular renewal.\n\nYou can confirm this under Settings > Billing > Invoice History: you should see the prorated upgrade charge listed separately from the regular one. From your next billing date you'll simply be charged the Business plan price.\n\nIf the charges there don't match what I've described, reply with the dates and amounts you see and I'll take a closer look.\n\nBest regards,\nSupport Team",
  },
  {
    id: "billing-payment-failed",
    category: "Billing",
    email:
      "Subject: Payment failed — will we lose access?\n\nWe got an email saying our payment failed. Our company card expired last week. How do I update it, and is our account going to be shut down?",
    response:
      "Hi there,\n\nNo need to worry — your account isn't shut down. A failed payment is retried up to 3 times over 7 days, so there's time to fix this.\n\nTo update the card: go to Settings > Billing > Payment Method > Update and enter the new card. It will be used for the next retry and future charges.\n\nFor completeness: if all 3 retries were to fail, access would be paused until a valid payment method is added, but your data would not be deleted.\n\nBest regards,\nSupport Team",
  },
  {
    id: "billing-cancel-data",
    category: "Billing",
    email:
      "Subject: What happens to our data if we cancel?\n\nWe're thinking about cancelling at the end of this month. If we do, when do we lose access, and what happens to all our tickets?",
    response:
      "Hi there,\n\nHappy to explain how cancelling works so you can decide.\n\n- Access: after you cancel, no future charges are scheduled, but your current plan stays fully active until the end of the billing period you've already paid for.\n- After that: the account becomes read-only — you can still log in and view past tickets, but automation rules and integrations are paused.\n- Your data: tickets, automation rules and integration connections are kept for 30 days after the billing period ends. You can reactivate any time in that window and pick up where you left off; after 30 days the data is permanently deleted.\n\nIf you'd like to keep a copy of anything before then, let me know what you need and I'll point you in the right direction.\n\nBest regards,\nSupport Team",
  },
  {
    id: "refund-duplicate-charge",
    category: "Refund",
    email:
      "Subject: Charged $79 twice on the same day\n\nOur Business plan was charged $79 twice on March 3. We didn't change plans. Please refund the extra one.",
    response:
      "Hi there,\n\nI'm sorry about the double charge — that's frustrating to find. Two identical charges on the same day with no plan change is exactly what a duplicate charge looks like, and duplicate charges caused by a billing error are refunded in full once the duplicate is confirmed, regardless of how long ago it happened.\n\nTo confirm it, could you reply with the email address on your account? You've already given the date and amount, which helps. Once the duplicate is verified, the refund goes back to your original payment method, usually within 5–10 business days depending on your bank.\n\nBest regards,\nSupport Team",
  },
  {
    id: "refund-outside-window",
    category: "Refund",
    email:
      "Subject: Refund for annual renewal\n\nOur annual plan renewed about three weeks ago and we'd forgotten to cancel. We don't need it anymore — can we get the renewal refunded?",
    response:
      "Hi there,\n\nThanks for reaching out, and I understand how easy it is to miss a renewal date.\n\nI want to be upfront: charges are eligible for a full refund when the request is made within 14 days of the charge date — for annual plans that window starts from the renewal charge. At about three weeks, this renewal falls outside that window, so I can't promise a refund for it. The exception is a duplicate or billing-error charge, which doesn't seem to be the case here.\n\nIf you cancel now, no future charges will be scheduled and you'll keep full access for the period you've paid for. If the renewal was actually more recent than three weeks, reply with the exact charge date and I'll check it against the 14-day window.\n\nBest regards,\nSupport Team",
  },
  {
    id: "account-reset-email-missing",
    category: "Account Issue",
    email:
      "Subject: Password reset email never arrives\n\nI've clicked 'Forgot password' three times and nothing shows up in my inbox. I really need to get in.",
    response:
      "Hi there,\n\nSorry you're stuck — let's get you back in.\n\nReset emails are sent immediately, so if nothing has arrived:\n1. Check your spam or junk folder.\n2. Make sure you're entering the exact email address your account was created with — a work vs. personal address is the most common mix-up.\n3. Use the newest link only: each reset link expires after 1 hour.\n\nIf you've checked both and still see nothing, reply with the email address you're entering and I'll look into it from here.\n\nBest regards,\nSupport Team",
  },
  {
    id: "account-2fa-lost-phone",
    category: "Account Issue",
    email:
      "Subject: Lost my phone, can't pass 2FA\n\nMy phone was stolen and my authenticator app was on it. Now I can't log in. What do I do?",
    response:
      "Hi there,\n\nI'm sorry about your phone — that's a stressful situation. When you set up two-factor authentication you were given 10 single-use recovery codes; if you saved them, you can enter one at the 2FA prompt instead of an authenticator code to get back in, then set up 2FA again on your new device.\n\nIf you don't have those codes, recovery requires a manual identity verification with our team. Just reply to this message to let me know, and we'll continue the verification here.\n\nBest regards,\nSupport Team",
  },
  {
    id: "account-sso-login",
    category: "Account Issue",
    email:
      "Subject: Can't log in after joining a new team\n\nI was just added to my company's workspace but my email and password don't work on the login page. My colleagues can get in fine.",
    response:
      "Hi there,\n\nThanks for the details — this usually comes down to how your company signs in. If your company uses single sign-on (SSO), you need to log in through your company's SSO portal rather than the regular email and password form.\n\nIf SSO doesn't apply, a couple of quick checks:\n1. Make sure you're using the exact email address you were invited with.\n2. Try a private/incognito window to rule out a cached session.\n3. If it still fails, use \"Forgot password\" instead of retrying — 5 failed attempts temporarily lock the account for 30 minutes.\n\nLet me know how it goes.\n\nBest regards,\nSupport Team",
  },
  {
    id: "bug-automation-not-triggering",
    category: "Bug/Technical Issue",
    email:
      "Subject: Automation rule not firing\n\nI created a rule to auto-assign emails with 'invoice' in the subject to our billing team, but nothing gets assigned. Is automation broken?",
    response:
      "Hi there,\n\nThanks for flagging this. Two things usually explain a rule that doesn't fire:\n\n1. Plan: automation rules are available on the Pro and Business plans. You can confirm your plan under Settings > Billing.\n2. Trigger conditions: the most common cause is a condition that's more specific than intended — for example, matching the exact subject line \"invoice\" instead of \"subject contains invoice\". It's worth opening the rule and checking that setting.\n\nIf you're on an eligible plan and the condition looks right, reply with a screenshot of the rule's settings and the subject of an email it should have caught, and I'll dig in.\n\nBest regards,\nSupport Team",
  },
  {
    id: "bug-app-freezing",
    category: "Bug/Technical Issue",
    email:
      "Subject: App keeps freezing\n\nSince this morning the app freezes every few minutes and I have to reload the page. It's slowing me down a lot.",
    response:
      "Hi there,\n\nSorry about the disruption — freezing every few minutes is really frustrating.\n\nFirst, please check our status page: sudden, widespread freezing is most often an incident on our side. If the status page is clear, these steps usually fix it:\n1. Clear your browser cache and make sure your browser is up to date.\n2. Disable browser extensions one at a time — ad blockers and privacy extensions are the most common cause.\n\nIf it keeps happening, reply with your browser and operating system, any error message you see, and roughly when it started, and I'll investigate further.\n\nBest regards,\nSupport Team",
  },
  {
    id: "bug-inbox-sync-delay",
    category: "Bug/Technical Issue",
    email:
      "Subject: New emails not showing up\n\nCustomer emails aren't appearing in our shared inbox. The last one came in about an hour ago and we know more have been sent. Please help, this is urgent.",
    response:
      "Hi there,\n\nI understand this is urgent — missing customer emails needs fixing fast. Please try this first, it's the most common cause:\n\n1. Go to Settings > Integrations and check whether your email connection still shows \"Connected\".\n2. If it doesn't, reauthorize it. Connections sometimes lose access after a password change on the connected mailbox.\n\nFor reference, new emails can take up to 15 minutes to appear during normal sync, but an hour is well beyond that. If the connection shows \"Connected\" and emails still aren't arriving, reply right away with the connected mailbox address and when the last email came in, and I'll prioritize this.\n\nBest regards,\nSupport Team",
  },
  {
    id: "feature-request-export",
    category: "Feature Request",
    email:
      "Subject: Suggestion: bulk export to CSV\n\nIt would be great to export all our tickets to CSV for quarterly reporting. Any chance you could add that?",
    response:
      "Hi there,\n\nThanks for the suggestion — quarterly reporting is a great use case and exactly the kind of feedback that helps us prioritize.\n\nI'm passing your request for bulk ticket export to CSV to our product team. I can't promise whether or when it will be built, but if it moves forward we'll let you know in this conversation.\n\nIf you can share which fields you'd most need in the export, that would make the request even more useful.\n\nBest regards,\nSupport Team",
  },
  {
    id: "other-undocumented-discount",
    category: "Other",
    email:
      "Subject: Nonprofit discount?\n\nWe're a small nonprofit looking at the Pro plan. Do you offer a nonprofit discount?",
    response:
      "Hi there,\n\nThanks for considering us, and for the work you do.\n\nOur published pricing doesn't include a nonprofit discount, so I don't want to promise one. I'll check with the team and follow up in this conversation. In the meantime, one saving that is available to everyone: paying annually gives a 20% discount on any plan, applied automatically when you select \"Bill annually\" at checkout.\n\nBest regards,\nSupport Team",
  },
  {
    id: "other-positive-feedback",
    category: "Other",
    email:
      "Subject: Great onboarding\n\nJust wanted to say your team made onboarding really smooth for us. Everyone's up and running already. Thanks!",
    response:
      "Hi there,\n\nThank you for taking the time to write — it's great to hear everyone is up and running so quickly. I'll share your note with the team who helped you; it will make their day.\n\nIf anything comes up as you settle in, just reply here.\n\nBest regards,\nSupport Team",
  },
];
