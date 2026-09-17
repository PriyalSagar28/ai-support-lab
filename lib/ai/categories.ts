// The fixed category taxonomy for email classification. Shared by the
// categorize module (prompt + validation) and the mock provider (keyword
// heuristics), so there is exactly one place that defines "what a category
// is" in this app.

export const CATEGORIES = [
  "Billing",
  "Bug/Technical Issue",
  "Refund",
  "Account Issue",
  "Feature Request",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
