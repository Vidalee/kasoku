import { NextRequest, NextResponse } from "next/server";
import { db, decks, wordDecks } from "@/db";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      color: decks.color,
      dailyNewCardLimit: decks.dailyNewCardLimit,
      createdAt: decks.createdAt,
      wordCount: sql<number>`cast(count(${wordDecks.wordId}) as integer)`,
    })
    .from(decks)
    .leftJoin(wordDecks, eq(decks.id, wordDecks.deckId))
    .groupBy(decks.id)
    .orderBy(decks.createdAt);

  return NextResponse.json({ decks: rows });
}

export async function POST(req: NextRequest) {
  const { name, color, dailyNewCardLimit } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const [deck] = await db.insert(decks).values({
    name: name.trim(),
    color: color ?? "#6750A4",
    dailyNewCardLimit: dailyNewCardLimit ?? null,
  }).returning();
  return NextResponse.json({ deck }, { status: 201 });
}
