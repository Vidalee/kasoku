import { type NextRequest, NextResponse } from "next/server";
import { db, srsCards, wordDecks } from "@/db";
import { eq, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const deckId = req.nextUrl.searchParams.get("deckId");

  let allCards: { wordId: string; state: number; scheduledDays: number }[];

  if (deckId) {
    const wds = await db.select({ wordId: wordDecks.wordId }).from(wordDecks).where(eq(wordDecks.deckId, deckId));
    const wordIds = wds.map((w) => w.wordId);
    if (!wordIds.length) return NextResponse.json({ new: 0, learning: 0, young: 0, mature: 0 });
    allCards = await db
      .select({ wordId: srsCards.wordId, state: srsCards.state, scheduledDays: srsCards.scheduledDays })
      .from(srsCards)
      .where(inArray(srsCards.wordId, wordIds));
  } else {
    allCards = await db
      .select({ wordId: srsCards.wordId, state: srsCards.state, scheduledDays: srsCards.scheduledDays })
      .from(srsCards);
  }

  // Worst-case per word: 0=new < 1=learning < 2=young(interval<21d) < 3=mature
  const byWord = new Map<string, number>();
  for (const card of allCards) {
    let score: number;
    if (card.state === 0) score = 0;
    else if (card.state === 1 || card.state === 3) score = 1;
    else if (card.scheduledDays < 21) score = 2;
    else score = 3;
    const prev = byWord.get(card.wordId);
    if (prev === undefined || score < prev) byWord.set(card.wordId, score);
  }

  let newCount = 0, learning = 0, young = 0, mature = 0;
  for (const score of byWord.values()) {
    if (score === 0) newCount++;
    else if (score === 1) learning++;
    else if (score === 2) young++;
    else mature++;
  }

  return NextResponse.json({ new: newCount, learning, young, mature });
}
