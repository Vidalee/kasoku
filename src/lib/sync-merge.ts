/**
 * Server-side merge logic for POST /api/sync.
 *
 * Merge strategies per table:
 *   words       — upsert by id, last-write-wins by updatedAt
 *   decks       — upsert by id, deduplicate by name (keep oldest)
 *   wordDecks   — insert missing (idempotent)
 *   reviewLogs  — append-only: insert by id, never update
 *   srsCards    — recomputed from merged review logs (never trust client state)
 *   sentences   — insert by id (idempotent, additive)
 *   sentenceWords — insert missing (idempotent)
 */

import { db, words, decks, wordDecks, srsCards, reviewLogs, sentences, sentenceWords } from "@/db";
import { eq, gt, sql, inArray } from "drizzle-orm";
import { dbRowToCard, cardToDbRow, scheduleCard, type RatingLabel, newCard } from "@/lib/fsrs";
import { Rating } from "ts-fsrs";

const RATING_TO_LABEL: Record<number, RatingLabel> = {
  1: "Again", 2: "Hard", 3: "Good", 4: "Easy",
};

export interface ClientChanges {
  words: ClientWord[];
  decks: ClientDeck[];
  wordDecks: { wordId: string; deckId: string }[];
  reviewLogs: ClientLog[];
  sentences: ClientSentence[];
  sentenceWords: { sentenceId: string; wordId: string }[];
}

interface ClientWord {
  id: string; kanji: string; furigana: string; meaning: string;
  jlptLevel: number | null; tags: string[]; createdAt: number; updatedAt: number;
}
interface ClientDeck {
  id: string; name: string; color: string; dailyNewCardLimit?: number | null;
  createdAt: number; updatedAt: number;
}
interface ClientLog {
  id: string; cardId: string; wordId: string; rating: number;
  reviewedAt: number; elapsedDays: number; deviceId: string;
}
interface ClientSentence {
  id: string; japanese: string; english: string; source: string;
  tatoebaId: number | null; createdAt: number;
}

export async function mergeClientChanges(changes: ClientChanges, lastSyncAt: number | null) {
  // ── 1. Words (last-write-wins by updatedAt) ────────────────────────────────
  for (const w of changes.words) {
    const existing = await db.select().from(words).where(eq(words.id, w.id)).limit(1);
    if (!existing.length) {
      await db.insert(words).values({
        id: w.id, kanji: w.kanji, furigana: w.furigana, meaning: w.meaning,
        jlptLevel: w.jlptLevel ?? null, tags: w.tags,
        createdAt: new Date(w.createdAt), updatedAt: new Date(w.updatedAt),
      });
      // Create SRS cards for new word
      const card = newCard();
      const base = cardToDbRow(card);
      await db.insert(srsCards).values([
        { ...base, id: crypto.randomUUID(), wordId: w.id, direction: 0 },
        { ...base, id: crypto.randomUUID(), wordId: w.id, direction: 1 },
      ]).onConflictDoNothing();
    } else if (new Date(w.updatedAt) > existing[0].updatedAt!) {
      await db.update(words).set({
        kanji: w.kanji, furigana: w.furigana, meaning: w.meaning,
        jlptLevel: w.jlptLevel ?? null, tags: w.tags, updatedAt: new Date(w.updatedAt),
      }).where(eq(words.id, w.id));
    }
  }

  // ── 2. Decks (upsert, deduplicate by name — keep oldest id) ───────────────
  for (const d of changes.decks) {
    const byId = await db.select().from(decks).where(eq(decks.id, d.id)).limit(1);
    if (!byId.length) {
      // Check for name collision → keep the one with the earlier createdAt
      const byName = await db.select().from(decks).where(eq(decks.name, d.name)).limit(1);
      if (!byName.length) {
        await db.insert(decks).values({
          id: d.id, name: d.name, color: d.color,
          dailyNewCardLimit: d.dailyNewCardLimit ?? null,
          createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt),
        });
      }
      // else: server already has a deck with this name — skip, client will be told to use server's id
    } else if (new Date(d.updatedAt) > byId[0].updatedAt!) {
      await db.update(decks).set({
        name: d.name, color: d.color,
        dailyNewCardLimit: d.dailyNewCardLimit ?? null,
        updatedAt: new Date(d.updatedAt),
      }).where(eq(decks.id, d.id));
    }
  }

  // ── 3. WordDecks (additive, idempotent) ────────────────────────────────────
  for (const wd of changes.wordDecks) {
    await db.insert(wordDecks).values({ wordId: wd.wordId, deckId: wd.deckId })
      .onConflictDoNothing();
  }

  // ── 4. Review logs (append-only) ──────────────────────────────────────────
  const newLogCardIds = new Set<string>();
  for (const log of changes.reviewLogs) {
    const existing = await db.select({ id: reviewLogs.id }).from(reviewLogs)
      .where(eq(reviewLogs.id, log.id)).limit(1);
    if (!existing.length) {
      // Ensure the card exists before inserting the log
      const card = await db.select().from(srsCards).where(eq(srsCards.id, log.cardId)).limit(1);
      if (card.length) {
        await db.insert(reviewLogs).values({
          id: log.id, cardId: log.cardId, wordId: log.wordId,
          rating: log.rating, reviewedAt: new Date(log.reviewedAt),
          elapsedDays: log.elapsedDays, deviceId: log.deviceId,
        });
        newLogCardIds.add(log.cardId);
      }
    }
  }

  // ── 5. Recompute SRS card state from full log history ─────────────────────
  // For every card that received new logs, replay ALL its logs in order
  // to produce the canonical FSRS state. This resolves multi-device conflicts.
  for (const cardId of newLogCardIds) {
    await recomputeCardState(cardId);
  }

  // ── 6. Sentences (additive, idempotent) ────────────────────────────────────
  for (const s of changes.sentences) {
    await db.insert(sentences).values({
      id: s.id, japanese: s.japanese, english: s.english,
      source: s.source, tatoebaId: s.tatoebaId ?? null,
      createdAt: new Date(s.createdAt),
    }).onConflictDoNothing();
  }
  for (const sw of changes.sentenceWords) {
    await db.insert(sentenceWords).values({ sentenceId: sw.sentenceId, wordId: sw.wordId })
      .onConflictDoNothing();
  }
}

// Replay all review logs for a card in chronological order to get canonical state
export async function recomputeCardState(cardId: string) {
  const logs = await db.select().from(reviewLogs)
    .where(eq(reviewLogs.cardId, cardId))
    .orderBy(reviewLogs.reviewedAt);

  if (!logs.length) return;

  let card = newCard();
  for (const log of logs) {
    const label = RATING_TO_LABEL[log.rating];
    if (!label) continue;
    const { card: next } = scheduleCard(card, label, log.reviewedAt);
    card = next;
  }

  await db.update(srsCards)
    .set({ ...cardToDbRow(card), updatedAt: new Date() })
    .where(eq(srsCards.id, cardId));
}

// Return all records updated since lastSyncAt (to send back to client)
export async function getServerChangesSince(lastSyncAt: number | null) {
  const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);

  const [
    changedWords, changedDecks, allDeckIds, changedWordDecks,
    changedCards, changedLogs, changedSentences, changedSentenceWords,
  ] = await Promise.all([
    db.select().from(words).where(gt(words.updatedAt, since)),
    db.select().from(decks).where(gt(decks.updatedAt, since)),
    db.select({ id: decks.id }).from(decks),
    // word_decks have no updatedAt — always send all (idempotent, additive)
    db.select().from(wordDecks),
    db.select().from(srsCards).where(gt(srsCards.updatedAt, since)),
    db.select().from(reviewLogs).where(gt(reviewLogs.reviewedAt, since)),
    db.select().from(sentences).where(gt(sentences.createdAt, since)),
    // sentence_words have no updatedAt — always send all (idempotent, additive)
    db.select().from(sentenceWords),
  ]);

  // Normalize dates to Unix ms for JSON (Dexie uses number timestamps)
  return {
    words: changedWords.map(toClientWord),
    decks: changedDecks.map(toClientDeck),
    allDeckIds: allDeckIds.map((d) => d.id),
    wordDecks: changedWordDecks,
    srsCards: changedCards.map(toClientCard),
    reviewLogs: changedLogs.map(toClientLog),
    sentences: changedSentences.map(toClientSentence),
    sentenceWords: changedSentenceWords,
  };
}

// ── Serializers (Date → number for JSON) ─────────────────────────────────────

function toClientWord(w: typeof words.$inferSelect) {
  return { ...w, createdAt: w.createdAt!.getTime(), updatedAt: w.updatedAt!.getTime(), _synced: 1 };
}
function toClientDeck(d: typeof decks.$inferSelect) {
  return { ...d, createdAt: d.createdAt!.getTime(), updatedAt: d.updatedAt!.getTime(), _synced: 1 };
}
function toClientCard(c: typeof srsCards.$inferSelect) {
  return {
    ...c, dueDate: c.dueDate.getTime(), lastReview: c.lastReview?.getTime() ?? null,
    createdAt: c.createdAt!.getTime(), updatedAt: c.updatedAt!.getTime(),
  };
}
function toClientLog(l: typeof reviewLogs.$inferSelect) {
  return { ...l, reviewedAt: l.reviewedAt.getTime(), _synced: 1 };
}
function toClientSentence(s: typeof sentences.$inferSelect) {
  return { ...s, createdAt: s.createdAt!.getTime(), _synced: 1 };
}
