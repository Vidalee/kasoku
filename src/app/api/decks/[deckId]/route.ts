import { NextRequest, NextResponse } from "next/server";
import { db, decks } from "@/db";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const { name, color } = await req.json();
  const [deck] = await db.update(decks).set({ name, color, updatedAt: new Date() }).where(eq(decks.id, deckId)).returning();
  return NextResponse.json({ deck });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  await db.delete(decks).where(eq(decks.id, deckId));
  return NextResponse.json({ ok: true });
}
