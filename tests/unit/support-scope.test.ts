// Offline tests for the support-scope guard and the retrieval gate in
// generate.ts. No network: providers and search are stubs. Run with
// `npm test`. (Live judgments by the real model: tests/live/.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSupportScope, parseSupportScopeResponse, buildSupportScopePrompt } from "../../lib/ai/support-scope";
import { retrieveGroundingKnowledge } from "../../lib/ai/generate";
import type { AIProvider } from "../../lib/ai/provider";
import type { RetrievedChunk } from "../../lib/ai/knowledge/types";

const CHUNKS: RetrievedChunk[] = [
  { id: "billing-faq.md#1", source: "billing-faq.md", title: "Billing FAQ", text: "Why was I charged twice?\n\n…", score: 0.76 },
];

function stubProvider(respond: () => Promise<string> | string, name = "gemini") {
  const calls: string[] = [];
  const provider: AIProvider = {
    name,
    async complete(prompt: string) {
      calls.push(prompt);
      return respond();
    },
  };
  return { provider, calls };
}

function stubSearch(result: RetrievedChunk[] = CHUNKS) {
  const queries: string[] = [];
  const search = async (query: string) => {
    queries.push(query);
    return result;
  };
  return { search, queries };
}

test("parses in-scope and out-of-scope responses, including fenced JSON", () => {
  assert.deepEqual(parseSupportScopeResponse('{"inScope": true, "reason": "Billing question."}'), {
    inScope: true,
    reason: "Billing question.",
  });
  assert.deepEqual(parseSupportScopeResponse('```json\n{"inScope": false, "reason": "About Netflix."}\n```'), {
    inScope: false,
    reason: "About Netflix.",
  });
});

test("rejects malformed scope responses", () => {
  assert.throws(() => parseSupportScopeResponse("not json"));
  assert.throws(() => parseSupportScopeResponse('{"inScope": "no"}'));
  assert.throws(() => parseSupportScopeResponse("[]"));
});

test("scope prompt carries the customer email", () => {
  const prompt = buildSupportScopePrompt("Subject: Help\n\nMy inbox stopped syncing.");
  assert.match(prompt, /My inbox stopped syncing\./);
});

test("out-of-scope decision blocks retrieval entirely", async () => {
  const { provider } = stubProvider(() => '{"inScope": false, "reason": "Asks about another company."}');
  const { search, queries } = stubSearch();
  const result = await retrieveGroundingKnowledge("How much does Netflix Premium cost?", provider, search);
  assert.equal(result.scope.inScope, false);
  assert.equal(result.scope.via, "model");
  assert.deepEqual(result.retrievedChunks, []);
  assert.equal(queries.length, 0, "search must not run for out-of-scope email");
});

test("in-scope decision retrieves and passes chunks through unchanged", async () => {
  const { provider } = stubProvider(() => '{"inScope": true, "reason": "Duplicate charge."}');
  const { search, queries } = stubSearch();
  const email = "I was charged twice for my subscription this month.";
  const result = await retrieveGroundingKnowledge(email, provider, search);
  assert.equal(result.scope.inScope, true);
  assert.deepEqual(queries, [email]);
  assert.equal(result.retrievedChunks, CHUNKS, "the exact retrieved chunks must be returned");
});

test("fails open (in scope) when the scope check errors", async () => {
  const { provider } = stubProvider(() => Promise.reject(new Error("503 overloaded")));
  const { search, queries } = stubSearch();
  const result = await retrieveGroundingKnowledge("Our shared inbox is not syncing.", provider, search);
  assert.equal(result.scope.inScope, true);
  assert.equal(result.scope.via, "fallback");
  assert.equal(queries.length, 1);
});

test("fails open (in scope) on malformed scope output", async () => {
  const decision = await checkSupportScope("Anything", stubProvider(() => "garbage").provider);
  assert.deepEqual([decision.inScope, decision.via], [true, "fallback"]);
});

test("mock provider skips the scope check without calling the model", async () => {
  const { provider, calls } = stubProvider(() => "{}", "mock");
  const decision = await checkSupportScope("What's the weather today?", provider);
  assert.deepEqual([decision.inScope, decision.via], [true, "skipped"]);
  assert.equal(calls.length, 0);
});
