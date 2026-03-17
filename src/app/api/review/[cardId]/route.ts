import { NextRequest, NextResponse } from "next/server";
import { db, srsCards, reviewLogs } from "@/db";
import { scheduleCard, dbRowToCard, cardToDbRow, type RatingLabel } from "@/lib/fsrs";
import { eq } from "drizzle-orm";

// POST /api/review/[cardId]  body: { rating: "Again"|"Hard"|"Good"|"Easy" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const { rating, logId } = (await req.json()) as { rating: RatingLabel; logId?: string };

  const [row] = await db.select().from(srsCards).where(eq(srsCards.id, cardId));
  if (!row) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const card = dbRowToCard(row);
  const { card: next, log } = scheduleCard(card, rating);
  const updated = cardToDbRow(next);

  await db
    .update(srsCards)
    .set({ ...updated, updatedAt: new Date() })
    .where(eq(srsCards.id, cardId));

  // Use client-provided logId if given — sync will send the same id and be deduped
  await db.insert(reviewLogs).values({
    id: logId ?? crypto.randomUUID(),
    cardId,
    wordId: row.wordId,
    rating: log.rating,
    reviewedAt: log.review,
    elapsedDays: log.elapsed_days,
  }).onConflictDoNothing();

  return NextResponse.json({ card: next });
}
