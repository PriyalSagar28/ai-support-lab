export type ModuleInfo = {
  href: string;
  label: string;
  phase: string;
  description: string;
  featured?: boolean;
};

export const modules: ModuleInfo[] = [
  {
    href: "/categorize",
    label: "Categorize",
    phase: "Phase 1",
    description: "Classify an incoming email into a support category.",
  },
  {
    href: "/sentiment",
    label: "Sentiment",
    phase: "Phase 2",
    description: "Detect sentiment and urgency in the customer's tone.",
  },
  {
    href: "/generate",
    label: "Generate",
    phase: "Phase 3",
    description: "Draft a suggested reply grounded in past examples.",
  },
  {
    href: "/evaluate",
    label: "Evaluate",
    phase: "Phase 4",
    description: "Score a generated reply and explain why.",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    phase: "Phase 5",
    description: "The full workflow, end to end — from a raw email to a send/revise decision.",
    featured: true,
  },
];
