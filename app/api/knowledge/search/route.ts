import { NextResponse } from "next/server";
import { searchKnowledge } from "@/lib/ai/knowledge/retrieve";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const query = (body as { query?: unknown } | null)?.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "query" is required and must be a non-empty string.' },
      { status: 400 }
    );
  }

  const topKRaw = (body as { topK?: unknown } | null)?.topK;
  const topK = typeof topKRaw === "number" && topKRaw > 0 ? topKRaw : undefined;

  try {
    const results = await searchKnowledge(query, topK);
    return NextResponse.json({
      query,
      results: results.map((r) => ({
        id: r.id,
        source: r.source,
        title: r.title,
        text: r.text,
        score: r.score,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Knowledge search failed: ${message}` }, { status: 502 });
  }
}
