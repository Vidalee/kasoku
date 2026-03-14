import { NextRequest, NextResponse } from "next/server";
import { db, sentences } from "@/db";
import { eq } from "drizzle-orm";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  await db.delete(sentences).where(eq(sentences.id, sentenceId));
  return NextResponse.json({ ok: true });
}
