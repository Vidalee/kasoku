import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import * as schema from "@/db/schema";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { newCard, cardToDbRow } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

interface ImportRequest {
  sessionId: string;
  selectedDeckIds: string[];
  mapping: { kanji: string; furigana: string; meaning: string; sentences: string };
  deckNameMode: "full" | "last";
  jlptLevel: number | null;
}

export async function POST(req: NextRequest) {
  const body: ImportRequest = await req.json();
  const { sessionId, selectedDeckIds, mapping, deckNameMode, jlptLevel } = body;

  if (!sessionId || !selectedDeckIds?.length || !mapping?.kanji || !mapping?.meaning) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tempDir = path.join(tmpdir(), `kasoku-import-${sessionId}`);
  const collectionPath = path.join(tempDir, "collection.db");

  try {
    const ankiClient = createClient({ url: `file:${collectionPath}` });

    // Get deck metadata
    const colResult = await ankiClient.execute("SELECT decks, models FROM col LIMIT 1");
    const decksJson: Record<string, AnkiDeck> = JSON.parse(colResult.rows[0].decks as string);
    const modelsJson: Record<string, AnkiModel> = JSON.parse(colResult.rows[0].models as string);

    // Build note type → field list map
    const modelFields: Record<string, string[]> = {};
    for (const [id, m] of Object.entries(modelsJson)) {
      modelFields[id] = [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name);
    }

    // Get all notes belonging to selected decks (distinct by note id)
    const deckIdList = selectedDeckIds.map((id) => `'${id}'`).join(",");
    const notesResult = await ankiClient.execute(
      `SELECT DISTINCT n.id, n.mid, n.flds, n.tags, c.did
       FROM notes n
       JOIN cards c ON c.nid = n.id
       WHERE c.did IN (${deckIdList})`
    );

    ankiClient.close();

    // Ensure Kasoku decks exist for each selected Anki deck
    const deckIdMap: Record<string, string> = {}; // ankiDeckId → kasokuDeckId
    for (const ankiDeckId of selectedDeckIds) {
      const ankiDeck = decksJson[ankiDeckId];
      if (!ankiDeck) continue;
      const deckName = deckNameMode === "last"
        ? ankiDeck.name.split("::").pop()!
        : ankiDeck.name.replace(/::/g, " › ");

      // Find or create
      const existing = await db.select().from(schema.decks).where(eq(schema.decks.name, deckName)).limit(1);
      if (existing.length) {
        deckIdMap[ankiDeckId] = existing[0].id;
      } else {
        const [created] = await db.insert(schema.decks).values({ name: deckName, color: "#6750A4" }).returning();
        deckIdMap[ankiDeckId] = created.id;
      }
    }

    let imported = 0;
    let skipped = 0;

    for (const row of notesResult.rows) {
      const mid = String(row.mid);
      const fields = modelFields[mid] ?? [];
      const vals = (row.flds as string).split("\x1f");
      const fieldMap: Record<string, string> = {};
      fields.forEach((name, i) => { fieldMap[name] = stripHtml(vals[i] ?? ""); });

      const reading = (mapping.furigana ? fieldMap[mapping.furigana]?.trim() : "") ?? "";
      const kanji = fieldMap[mapping.kanji]?.trim() || reading; // kana-only words fall back to reading
      const furigana = reading || kanji;
      const meaning = fieldMap[mapping.meaning]?.trim();

      if (!kanji || !meaning) { skipped++; continue; }

      // Check for existing word (same kanji + furigana)
      const existing = await db.select({ id: schema.words.id })
        .from(schema.words)
        .where(and(eq(schema.words.kanji, kanji), eq(schema.words.furigana, furigana)))
        .limit(1);

      let wordId: string;
      if (existing.length) {
        // Word exists — reuse it (SRS progress preserved), just add to deck below
        wordId = existing[0].id;
        skipped++;
      } else {
        // New word — insert with SRS cards
        const [word] = await db.insert(schema.words).values({ kanji, furigana, meaning, tags: [], jlptLevel: jlptLevel ?? null }).returning();
        wordId = word.id;
        const cardBase = cardToDbRow(newCard());
        await db.insert(schema.srsCards).values([
          { ...cardBase, wordId, direction: 0 },
          { ...cardBase, wordId, direction: 1 },
        ]);
        imported++;
      }

      // Assign to deck (idempotent — onConflictDoNothing handles duplicates)
      const kasokuDeckId = deckIdMap[String(row.did)];
      if (kasokuDeckId) {
        await db.insert(schema.wordDecks).values({ wordId, deckId: kasokuDeckId }).onConflictDoNothing();
      }

      // Import example sentence if mapped
      if (mapping.sentences) {
        const rawSentence = fieldMap[mapping.sentences]?.trim();
        if (rawSentence) {
          const deckName = decksJson[String(row.did)]?.name
            ? (deckNameMode === "last"
                ? decksJson[String(row.did)].name.split("::").pop()!
                : decksJson[String(row.did)].name.replace(/::/g, " › "))
            : "anki";
          const existingSentence = await db.select({ id: schema.sentences.id })
            .from(schema.sentences)
            .where(eq(schema.sentences.japanese, rawSentence))
            .limit(1);
          const sentenceId = existingSentence.length
            ? existingSentence[0].id
            : (await db.insert(schema.sentences)
                .values({ japanese: rawSentence, english: "", source: deckName })
                .returning())[0].id;
          await db.insert(schema.sentenceWords)
            .values({ sentenceId, wordId })
            .onConflictDoNothing();
        }
      }
    }

    // Clean up temp dir
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}

    return NextResponse.json({
      imported,
      skipped,
      decks: Object.values(deckIdMap),
    });
  } catch (err) {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    console.error("Anki import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

function stripHtml(html: string): string {
  if (!html) return "";
  html = html.replace(/\[sound:[^\]]+\]/g, "");
  html = html.replace(/<details[\s\S]*?<\/details>/g, "");
  html = html.replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<\/?ruby>|<\/?rb>/g, "");
  html = html.replace(/<ul[\s\S]*?<\/ul>/g, "");
  const spanMatch = html.match(/<span[^>]*>([^<]+)<\/span>/);
  if (spanMatch) {
    const text = spanMatch[1].trim();
    if (text && !/^\(no /.test(text)) return text;
    return "";
  }
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

interface AnkiDeck { id: number; name: string; }
interface AnkiModel { id: number; name: string; flds: { name: string; ord: number }[]; }
