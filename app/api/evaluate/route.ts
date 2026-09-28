import { NextResponse } from "next/server";
import { evaluateReply } from "@/lib/ai/evaluate";
import { SENTIMENTS, URGENCIES, type Sentiment, type Urgency } from "@/lib/ai/sentiment-labels";
import type { RetrievedChunk } from "@/lib/ai/knowledge/types";

function isSentiment(value: unknown): value is Sentiment {
  return typeof value === "string" && (SENTIMENTS as readonly string[]).includes(value);
}

function isUrgency(value: unknown): value is Urgency {
  return typeof value === "string" && (URGENCIES as readonly string[]).includes(value);
}

function isRetrievedChunk(value: unknown): value is RetrievedChunk {
  if (typeof value !== "object" || value === null) return false;
  const { id, source, title, text, score } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    typeof source === "string" &&
    typeof title === "string" &&
    typeof text === "string" &&
    typeof score === "number"
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const email = (body as { email?: unknown } | null)?.email;
  const reply = (body as { reply?: unknown } | null)?.reply;
  const sentiment = (body as { sentiment?: unknown } | null)?.sentiment;
  const urgency = (body as { urgency?: unknown } | null)?.urgency;

  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "email" is required and must be a non-empty string.' },
      { status: 400 }
    );
  }
  if (typeof reply !== "string" || reply.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "reply" is required and must be a non-empty string.' },
      { status: 400 }
    );
  }
  if (!isSentiment(sentiment)) {
    return NextResponse.json(
      { error: `Field "sentiment" must be one of: ${SENTIMENTS.join(", ")}.` },
      { status: 400 }
    );
  }
  if (!isUrgency(urgency)) {
    return NextResponse.json(
      { error: `Field "urgency" must be one of: ${URGENCIES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Optional: the exact chunks retrieved during generation for this reply
  // (see GenerateResult.retrievedChunks in lib/ai/generate.ts). Omit it to
  // fall back to email-only grounding, same as before RAG evaluation was
  // added — this endpoint never re-runs retrieval itself.
  const rawRetrievedChunks = (body as { retrievedChunks?: unknown } | null)?.retrievedChunks;
  let retrievedChunks: RetrievedChunk[] | undefined;
  if (rawRetrievedChunks !== undefined) {
    if (!Array.isArray(rawRetrievedChunks) || !rawRetrievedChunks.every(isRetrievedChunk)) {
      return NextResponse.json(
        { error: 'Field "retrievedChunks" must be an array of {id, source, title, text, score} objects.' },
        { status: 400 }
      );
    }
    retrievedChunks = rawRetrievedChunks;
  }

  try {
    const result = await evaluateReply({ email, reply, sentiment, urgency, retrievedChunks });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Evaluation failed: ${message}` }, { status: 502 });
  }
}
