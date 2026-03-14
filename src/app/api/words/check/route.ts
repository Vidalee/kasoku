import { NextRequest, NextResponse } from "next/server";
import { db, words } from "@/db";
import { inArray } from "drizzle-orm";

// POST /api/words/check  body: { readings: string[] }
// Returns which readings already exist in the vocabulary
export async function POST(req: NextRequest) {
  const { readings } = await req.json() as { readings: string[] };
  if (!readings?.length) return NextResponse.json({ known: [] });

  const rows = await db
    .select({ furigana: words.furigana, kanji: words.kanji, id: words.id, meaning: words.meaning })
    .from(words)
    .where(inArray(words.furigana, readings));

  return NextResponse.json({ known: rows });
}
