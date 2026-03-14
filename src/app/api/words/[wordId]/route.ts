import { NextRequest, NextResponse } from "next/server";
import { db, words, wordDecks, srsCards } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wordId: string }> }) {
  const { wordId } = await params;
  const [word] = await db.select().from(words).where(eq(words.id, wordId));
  if (!word) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const decks = await db.select({ deckId: wordDecks.deckId }).from(wordDecks).where(eq(wordDecks.wordId, wordId));
  return NextResponse.json({ word, deckIds: decks.map((d) => d.deckId) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ wordId: string }> }) {
  const { wordId } = await params;
  const { kanji, furigana, meaning, jlptLevel, tags, deckIds } = await req.json();

  const [word] = await db
    .update(words)
    .set({ kanji, furigana, meaning, jlptLevel: jlptLevel ?? null, tags: tags ?? [], updatedAt: new Date() })
    .where(eq(words.id, wordId))
    .returning();

  if (deckIds !== undefined) {
    await db.delete(wordDecks).where(eq(wordDecks.wordId, wordId));
    if (deckIds.length > 0) {
      await db.insert(wordDecks).values(deckIds.map((id: string) => ({ wordId, deckId: id })));
    }
  }

  return NextResponse.json({ word });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ wordId: string }> }) {
  const { wordId } = await params;
  await db.delete(words).where(eq(words.id, wordId));
  return NextResponse.json({ ok: true });
}
