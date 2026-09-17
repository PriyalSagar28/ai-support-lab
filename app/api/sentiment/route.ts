import { NextResponse } from "next/server";
import { analyzeSentiment } from "@/lib/ai/sentiment";

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

  try {
    const result = await analyzeSentiment(email);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Sentiment analysis failed: ${message}` }, { status: 502 });
  }
}
