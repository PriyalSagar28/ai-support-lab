// Live checks of the support-scope guard + retrieval gate against the real
// Gemini provider and the real knowledge index. Makes one scope call per
// case, plus one embedding call for each in-scope case — no reply
// generation, no evaluation. Run explicitly with `npm run test:live`
// (needs GEMINI_API_KEY in .env.local); skipped without a key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieveGroundingKnowledge } from "../../lib/ai/generate";
import { getProvider } from "../../lib/ai/provider";

const hasKey = Boolean(process.env.GEMINI_API_KEY);

const IN_DOMAIN = [
  "I was charged twice for my subscription this month.",
  "I forgot my password and cannot access my account.",
  "Our shared inbox is not syncing.",
];

const OUT_OF_DOMAIN = [
  "What's the weather today?",
  "What is the capital of India?",
  "How much does Netflix Premium cost?",
  "What are Spotify's subscription plans?",
  // The live-UI failure case, in the pipeline's exact email format.
  "Subject: Subscription cost is too high / Request for affordable plans\n\nI want affordable premium plans for netflix",
];

function gemini() {
  process.env.AI_PROVIDER = "gemini";
  return getProvider();
}

for (const email of IN_DOMAIN) {
  test(`in-domain → retrieval allowed: ${email}`, { skip: !hasKey && "GEMINI_API_KEY not set" }, async () => {
    const { scope, retrievedChunks } = await retrieveGroundingKnowledge(email, gemini());
    console.log(`  scope=${scope.inScope} (${scope.via}) chunks=${retrievedChunks.map((c) => `${c.id}@${c.score.toFixed(3)}`).join(", ")}`);
    assert.equal(scope.via, "model");
    assert.equal(scope.inScope, true);
    assert.ok(retrievedChunks.length > 0, "expected at least one knowledge chunk");
  });
}

for (const email of OUT_OF_DOMAIN) {
  test(`out-of-domain → retrieval blocked: ${email.replace(/\n+/g, " / ")}`, { skip: !hasKey && "GEMINI_API_KEY not set" }, async () => {
    const { scope, retrievedChunks } = await retrieveGroundingKnowledge(email, gemini());
    console.log(`  scope=${scope.inScope} (${scope.via}) chunks=${retrievedChunks.length} reason="${scope.reason}"`);
    assert.equal(scope.via, "model");
    assert.equal(scope.inScope, false);
    assert.equal(retrievedChunks.length, 0);
  });
}
