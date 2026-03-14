import { NextRequest, NextResponse } from "next/server";
import { db, words, wordDecks, srsCards } from "@/db";
import { newCard, cardToDbRow } from "@/lib/fsrs";
import { eq, like, or, sql } from "drizzle-orm";

// GET /api/words?q=...&deck=...&jlpt=...
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const deckId = searchParams.get("deck");
  const jlpt = searchParams.get("jlpt");

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        like(words.kanji, `%${q}%`),
        like(words.furigana, `%${q}%`),
        like(words.meaning, `%${q}%`)
      )
    );
  }
  if (jlpt) {
    conditions.push(eq(words.jlptLevel, parseInt(jlpt)));
  }

  let rows;
  if (deckId) {
    rows = await db
      .select({ word: words })
      .from(words)
      .innerJoin(wordDecks, eq(words.id, wordDecks.wordId))
      .where(
        sql`${wordDecks.deckId} = ${deckId}${conditions.length ? sql` AND ${sql.join(conditions, sql` AND `)}` : sql``}`
      )
      .orderBy(words.createdAt);
  } else {
    rows = await db
      .select({ word: words })
      .from(words)
      .where(conditions.length ? sql.join(conditions, sql` AND `) : undefined)
      .orderBy(words.createdAt);
  }

  return NextResponse.json({ words: rows.map((r) => r.word) });
}

// POST /api/words — create a new word + its SRS cards
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { kanji, furigana, meaning, jlptLevel, tags, deckIds } = body;

  if (!kanji || !furigana || !meaning) {
    return NextResponse.json({ error: "kanji, furigana, and meaning are required" }, { status: 400 });
  }

  const [word] = await db
    .insert(words)
    .values({ kanji, furigana, meaning, jlptLevel: jlptLevel ?? null, tags: tags ?? [] })
    .returning();

  // Create SRS cards: direction 0 (kanji→meaning) and 1 (meaning→kana)
  const cardBase = cardToDbRow(newCard());
  await db.insert(srsCards).values([
    { ...cardBase, wordId: word.id, direction: 0 },
    { ...cardBase, wordId: word.id, direction: 1 },
  ]);

  // Assign to decks
  if (deckIds?.length) {
    await db.insert(wordDecks).values(deckIds.map((id: string) => ({ wordId: word.id, deckId: id })));
  }

  return NextResponse.json({ word }, { status: 201 });
}
