import { NextResponse } from "next/server";
import { generateReply } from "@/lib/ai/generate";
import { SENTIMENTS, URGENCIES, type Sentiment, type Urgency } from "@/lib/ai/sentiment-labels";

function isSentiment(value: unknown): value is Sentiment {
  return typeof value === "string" && (SENTIMENTS as readonly string[]).includes(value);
}

function isUrgency(value: unknown): value is Urgency {
  return typeof value === "string" && (URGENCIES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "email" is required and must be a non-empty string.' },
      { status: 400 }
    );
  }

  // Optional: a caller that already knows sentiment/urgency (the Phase 5
  // pipeline, which just computed them) can pass them through to skip a
  // redundant sentiment analysis call. Omit both to keep the original Phase
  // 3 behavior of deriving them internally.
  const rawSentiment = (body as { sentiment?: unknown } | null)?.sentiment;
  const rawUrgency = (body as { urgency?: unknown } | null)?.urgency;
  let precomputed: { sentiment: Sentiment; urgency: Urgency } | undefined;

  if (rawSentiment !== undefined || rawUrgency !== undefined) {
    if (!isSentiment(rawSentiment)) {
      return NextResponse.json(
        { error: `Field "sentiment" must be one of: ${SENTIMENTS.join(", ")}.` },
        { status: 400 }
      );
    }
    if (!isUrgency(rawUrgency)) {
      return NextResponse.json(
        { error: `Field "urgency" must be one of: ${URGENCIES.join(", ")}.` },
        { status: 400 }
      );
    }
    precomputed = { sentiment: rawSentiment, urgency: rawUrgency };
  }

  try {
    const result = await generateReply(email, precomputed);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Reply generation failed: ${message}` }, { status: 502 });
  }
}
