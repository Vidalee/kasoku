import { NextRequest, NextResponse } from "next/server";
import { db, sentences, sentenceWords, words } from "@/db";
import { eq, sql, notExists, like, or, desc } from "drizzle-orm";

// GET /api/sentences
// ?mode=review  — only sentences where all linked words are in vocab (for SRS)
// ?q=           — search japanese/english
// ?source=      — filter by source (tatoeba|custom)
// ?limit=&offset= — pagination
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode");
  const q = searchParams.get("q");
  const source = searchParams.get("source");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  if (mode === "review") {
    // Original behaviour: only vocab-matched sentences, random order
    const rows = await db
      .selectDistinct({ sentence: sentences })
      .from(sentences)
      .innerJoin(sentenceWords, eq(sentences.id, sentenceWords.sentenceId))
      .innerJoin(words, eq(sentenceWords.wordId, words.id))
      .where(
        notExists(
          db
            .select({ x: sql`1` })
            .from(sentenceWords)
            .where(
              sql`${sentenceWords.sentenceId} = ${sentences.id} AND NOT EXISTS (
                SELECT 1 FROM ${words} w2 WHERE w2.id = ${sentenceWords.wordId}
              )`
            )
        )
      )
      .limit(limit)
      .orderBy(sql`random()`);
    return NextResponse.json({ sentences: rows.map((r) => r.sentence) });
  }

  // List mode — all sentences, with optional search + source filter
  const conditions = [];
  if (q) conditions.push(or(like(sentences.japanese, `%${q}%`), like(sentences.english, `%${q}%`)));
  if (source) conditions.push(eq(sentences.source, source));

  const where = conditions.length ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined;

  const [rows, countRes, sourcesRes] = await Promise.all([
    db.select().from(sentences).where(where).orderBy(desc(sentences.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(sentences).where(where),
    db.selectDistinct({ source: sentences.source }).from(sentences).orderBy(sentences.source),
  ]);

  return NextResponse.json({ sentences: rows, total: countRes[0]?.count ?? 0, sources: sourcesRes.map((r) => r.source) });
}

// POST /api/sentences — add a custom sentence
export async function POST(req: NextRequest) {
  const { japanese, english, wordIds } = await req.json();
  if (!japanese || !english) return NextResponse.json({ error: "japanese and english required" }, { status: 400 });

  const [sentence] = await db.insert(sentences).values({ japanese, english, source: "custom" }).returning();

  if (wordIds?.length) {
    await db.insert(sentenceWords).values(wordIds.map((id: string) => ({ sentenceId: sentence.id, wordId: id })));
  }

  return NextResponse.json({ sentence }, { status: 201 });
}
