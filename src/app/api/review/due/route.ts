import { NextRequest, NextResponse } from "next/server";
import { db, srsCards, words } from "@/db";
import { wordDecks } from "@/db/schema";
import { lte, eq, and, sql } from "drizzle-orm";

// GET /api/review/due?deck=<id>&cram=true
// Returns cards due now (or all cards in deck if cram=true), with word data attached
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const deckId = searchParams.get("deck");
  const cram = searchParams.get("cram") === "true";

  const now = new Date();

  const dueCondition = cram ? undefined : lte(srsCards.dueDate, now);

  let rows;
  if (deckId) {
    rows = await db
      .select({ card: srsCards, word: words })
      .from(srsCards)
      .innerJoin(words, eq(srsCards.wordId, words.id))
      .innerJoin(wordDecks, eq(words.id, wordDecks.wordId))
      .where(
        and(
          eq(wordDecks.deckId, deckId),
          dueCondition
        )
      )
      .orderBy(srsCards.dueDate);
  } else {
    rows = await db
      .select({ card: srsCards, word: words })
      .from(srsCards)
      .innerJoin(words, eq(srsCards.wordId, words.id))
      .where(dueCondition)
      .orderBy(srsCards.dueDate);
  }

  // Shuffle so direction 0 and 1 of same word don't appear back-to-back
  const shuffled = rows.sort(() => Math.random() - 0.5);

  return NextResponse.json({ cards: shuffled });
}
