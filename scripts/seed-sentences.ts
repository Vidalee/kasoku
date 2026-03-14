#!/usr/bin/env bun
/**
 * Seeds Japanese-English sentence pairs from Tatoeba (via mwhirls/tatoeba-json).
 * Filters to sentences whose words overlap with your vocabulary.
 *
 * Run: bun run scripts/seed-sentences.ts
 * Options:
 *   --limit=5000   max sentences to import (default: 5000)
 *   --all          import without vocab filtering (useful for initial seed)
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/db/schema";
import { inArray, sql } from "drizzle-orm";
import path from "path";

const client = createClient({
  url: `file:${process.env.DATABASE_PATH ?? path.join(process.cwd(), "kasoku.db")}`,
});
const db = drizzle(client, { schema });

// Latest release of mwhirls/tatoeba-json
const TATOEBA_URL =
  "https://github.com/mwhirls/tatoeba-json/releases/latest/download/sentences.json";

interface TatoebaSentence {
  id: number;
  japanese: string;
  english: string;
  words?: { text: string; reading: string }[];
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 5000;
  const importAll = args.includes("--all");

  console.log(`Fetching Tatoeba sentences (limit: ${limit})…`);
  console.log("(This may take a moment — the file is large)\n");

  const res = await fetch(TATOEBA_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const sentences: TatoebaSentence[] = await res.json();
  console.log(`Fetched ${sentences.length} sentences from Tatoeba\n`);

  // Get all known readings from our vocab
  let knownReadings = new Set<string>();
  if (!importAll) {
    const vocabRows = await db.select({ furigana: schema.words.furigana }).from(schema.words);
    knownReadings = new Set(vocabRows.map((r) => r.furigana));
    console.log(`Vocab size: ${knownReadings.size} readings\n`);
  }

  let inserted = 0;
  let skipped = 0;

  for (const s of sentences) {
    if (inserted >= limit) break;
    if (!s.japanese || !s.english) continue;

    // Skip if already exists
    const existing = await db.select({ id: schema.sentences.id })
      .from(schema.sentences)
      .where(sql`${schema.sentences.tatoebaId} = ${s.id}`)
      .limit(1);
    if (existing.length) { skipped++; continue; }

    // Check if sentence words overlap with vocab (if not --all)
    let matchedWordIds: string[] = [];
    if (!importAll && s.words?.length) {
      const readings = s.words.map((w) => w.reading ?? w.text);
      const vocabWords = await db
        .select({ id: schema.words.id, furigana: schema.words.furigana })
        .from(schema.words)
        .where(inArray(schema.words.furigana, readings));

      if (vocabWords.length === 0) { skipped++; continue; }
      matchedWordIds = vocabWords.map((w) => w.id);
    }

    const [sentence] = await db.insert(schema.sentences).values({
      japanese: s.japanese,
      english: s.english,
      source: "tatoeba",
      tatoebaId: s.id,
    }).returning();

    if (matchedWordIds.length > 0) {
      await db.insert(schema.sentenceWords).values(
        matchedWordIds.map((wordId) => ({ sentenceId: sentence.id, wordId }))
      );
    }

    inserted++;
    if (inserted % 100 === 0) process.stdout.write(`\r  ${inserted} inserted…`);
  }

  console.log(`\n\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
