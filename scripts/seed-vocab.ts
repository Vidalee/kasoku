#!/usr/bin/env bun
/**
 * Seeds JLPT N5 and N4 vocabulary from Bluskyo/JLPT_Vocabulary (GitHub).
 * Run: bun run scripts/seed-vocab.ts
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/db/schema";
import { createEmptyCard } from "ts-fsrs";
import { eq } from "drizzle-orm";
import path from "path";

const client = createClient({
  url: `file:${process.env.DATABASE_PATH ?? path.join(process.cwd(), "kasoku.db")}`,
});
const db = drizzle(client, { schema });

const BASE_URL = "https://raw.githubusercontent.com/Bluskyo/JLPT_Vocabulary/main";
const LEVELS = [5, 4] as const;

interface JlptWord {
  expression: string;   // kanji form
  reading: string;      // hiragana reading
  meaning: string;      // English meaning
  level?: number;
}

async function fetchLevel(level: number): Promise<JlptWord[]> {
  const url = `${BASE_URL}/N${level}/N${level}.json`;
  console.log(`Fetching N${level} from ${url}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch N${level}: ${res.status}`);
  const data = await res.json();
  // The JSON is an array of objects with varying field names — normalize
  return data.map((item: Record<string, string>) => ({
    expression: item.expression ?? item.kanji ?? item.word ?? "",
    reading: item.reading ?? item.furigana ?? item.expression ?? "",
    meaning: item.meaning ?? item.english ?? item.definition ?? "",
    level,
  })).filter((w: JlptWord) => w.expression && w.reading && w.meaning);
}

async function ensureDeck(name: string, color: string) {
  const existing = await db.select().from(schema.decks).where(eq(schema.decks.name, name));
  if (existing.length) return existing[0];
  const [deck] = await db.insert(schema.decks).values({ name, color }).returning();
  return deck;
}

async function main() {
  console.log("Starting vocab seed…\n");

  const deckColors: Record<number, string> = { 5: "#4CAF50", 4: "#8BC34A" };

  let totalInserted = 0;

  for (const level of LEVELS) {
    let words: JlptWord[];
    try {
      words = await fetchLevel(level);
    } catch (e) {
      console.error(`Could not fetch N${level}:`, e);
      continue;
    }

    const deck = await ensureDeck(`JLPT N${level}`, deckColors[level]);
    console.log(`N${level}: ${words.length} words → deck "${deck.name}"`);

    let inserted = 0;
    for (const w of words) {
      // Skip if already exists (idempotent)
      const existing = await db.select({ id: schema.words.id })
        .from(schema.words)
        .where(eq(schema.words.furigana, w.reading))
        .limit(1);
      if (existing.length) continue;

      const [word] = await db.insert(schema.words).values({
        kanji: w.expression,
        furigana: w.reading,
        meaning: w.meaning,
        jlptLevel: level,
        tags: [],
      }).returning();

      // Create SRS cards (direction 0 + 1)
      const card = createEmptyCard();
      await db.insert(schema.srsCards).values([
        { wordId: word.id, direction: 0, stability: card.stability, difficulty: card.difficulty, elapsedDays: card.elapsed_days, scheduledDays: card.scheduled_days, reps: card.reps, lapses: card.lapses, learningSteps: card.learning_steps, state: card.state, dueDate: card.due },
        { wordId: word.id, direction: 1, stability: card.stability, difficulty: card.difficulty, elapsedDays: card.elapsed_days, scheduledDays: card.scheduled_days, reps: card.reps, lapses: card.lapses, learningSteps: card.learning_steps, state: card.state, dueDate: card.due },
      ]);

      // Assign to deck
      await db.insert(schema.wordDecks).values({ wordId: word.id, deckId: deck.id });
      inserted++;
    }

    console.log(`  → Inserted ${inserted} new words (${words.length - inserted} already existed)\n`);
    totalInserted += inserted;
  }

  console.log(`Done! Total new words: ${totalInserted}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
