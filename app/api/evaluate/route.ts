import { NextResponse } from "next/server";
import { evaluateReply } from "@/lib/ai/evaluate";
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

  try {
    const result = await evaluateReply({ email, reply, sentiment, urgency });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Evaluation failed: ${message}` }, { status: 502 });
  }
}
