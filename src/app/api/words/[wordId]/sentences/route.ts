import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sentences, sentenceWords } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wordId: string }> }) {
  const { wordId } = await params;
  const rows = await db
    .select({ id: sentences.id, japanese: sentences.japanese, english: sentences.english, source: sentences.source })
    .from(sentences)
    .innerJoin(sentenceWords, eq(sentenceWords.sentenceId, sentences.id))
    .where(eq(sentenceWords.wordId, wordId));
  return NextResponse.json({ sentences: rows });
}
