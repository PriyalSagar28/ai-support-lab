// Offline tests for the support-scope guard and the retrieval gate in
// generate.ts. No network: providers and search are stubs. Run with
// `npm test`. (Live judgments by the real model: tests/live/.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSupportScope, parseSupportScopeResponse, buildSupportScopePrompt } from "../../lib/ai/support-scope";
import { buildPrompt, retrieveGroundingKnowledge } from "../../lib/ai/generate";
import type { AIProvider } from "../../lib/ai/provider";
import type { RetrievedChunk, RetrievedExample } from "../../lib/ai/knowledge/types";

const CHUNKS: RetrievedChunk[] = [
  { id: "billing-faq.md#1", source: "billing-faq.md", title: "Billing FAQ", text: "Why was I charged twice?\n\n…", score: 0.76 },
];

const EXAMPLES: RetrievedExample[] = [
  {
    id: "refund-duplicate-charge",
    category: "Refund",
    email: "Subject: Charged $79 twice on the same day\n\n…",
    response: "Hi there,\n\n…",
    score: 0.8,
  },
];

function stubExamples(result: RetrievedExample[] = EXAMPLES) {
  const queries: string[] = [];
  const searchPast = async (query: string) => {
    queries.push(query);
    return result;
  };
  return { searchPast, queries };
}

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
  const { searchPast, queries: exampleQueries } = stubExamples();
  const result = await retrieveGroundingKnowledge("How much does Netflix Premium cost?", provider, search, searchPast);
  assert.equal(result.scope.inScope, false);
  assert.equal(result.scope.via, "model");
  assert.deepEqual(result.retrievedChunks, []);
  assert.deepEqual(result.retrievedExamples, []);
  assert.equal(queries.length, 0, "search must not run for out-of-scope email");
  assert.equal(exampleQueries.length, 0, "past examples must not be searched for out-of-scope email");
});

test("in-scope decision retrieves and passes chunks through unchanged", async () => {
  const { provider } = stubProvider(() => '{"inScope": true, "reason": "Duplicate charge."}');
  const { search, queries } = stubSearch();
  const { searchPast, queries: exampleQueries } = stubExamples();
  const email = "I was charged twice for my subscription this month.";
  const result = await retrieveGroundingKnowledge(email, provider, search, searchPast);
  assert.equal(result.scope.inScope, true);
  assert.deepEqual(queries, [email]);
  assert.deepEqual(exampleQueries, [email]);
  assert.equal(result.retrievedChunks, CHUNKS, "the exact retrieved chunks must be returned");
  assert.equal(result.retrievedExamples, EXAMPLES, "the exact retrieved examples must be returned");
});

test("fails open (in scope) when the scope check errors", async () => {
  const { provider } = stubProvider(() => Promise.reject(new Error("503 overloaded")));
  const { search, queries } = stubSearch();
  const result = await retrieveGroundingKnowledge("Our shared inbox is not syncing.", provider, search, stubExamples().searchPast);
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

test("prompt separates non-authoritative examples from the knowledge base", () => {
  const prompt = buildPrompt("Subject: Double charge\n\nCharged twice.", "Negative", "Medium", CHUNKS, true, EXAMPLES);
  assert.match(prompt, /HISTORICAL EXAMPLES[\s\S]*NOT authoritative policy/);
  assert.match(prompt, /KNOWLEDGE BASE — the source of truth/);
  assert.ok(prompt.indexOf("Charged $79 twice") < prompt.indexOf("Why was I charged twice?"), "examples come before the KB");
  assert.equal([...prompt.matchAll(/"""/g)].length, 2, "only the customer email may be triple-quoted (mock provider relies on it)");
});

test("out-of-scope prompt consults neither examples nor the knowledge base", () => {
  const prompt = buildPrompt("How much does Netflix cost?", "Neutral", "Low", [], false, []);
  assert.match(prompt, /Historical examples: not consulted/);
  assert.match(prompt, /Knowledge base: not consulted/);
});
