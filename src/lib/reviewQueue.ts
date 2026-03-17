/**
 * Queue-building utilities for review and learning sessions.
 * All reads go through Dexie (offline-first).
 */
import { localDb, type LSrsCard, type LWord, type LSentence } from "@/lib/localDb";

export interface ReviewItem {
  card: LSrsCard;
  word: LWord;
  sentence: LSentence | null;
}

export interface LearningCard {
  card: LSrsCard;       // direction=0, state=0
  word: LWord;
  sentence: LSentence | null;
  correctCount: number;
}

export interface DeckCardCounts {
  newAvailable: number;   // state=0, direction=0 cards not yet introduced today
  learning: number;       // state=1 or 3 (learning / relearning), due now
  dueReview: number;      // state=2, due now
}

// ── Unlock direction 1 after first direction 0 pass ──────────────────────────
// Returns the dir1 card if it was unlocked, null otherwise.
export async function unlockProductionCard(
  wordId: string,
  getDeviceId: () => string,
): Promise<{ cardId: string; logId: string } | null> {
  const dir1 = await localDb.srsCards
    .filter((c) => c.wordId === wordId && c.direction === 1 && c.state === 0)
    .first();
  if (!dir1) return null;

  const { dbRowToCard, cardToDbRow, scheduleCard } = await import("@/lib/fsrs");
  const fsrsCard = dbRowToCard({
    ...dir1,
    dueDate: new Date(dir1.dueDate),
    lastReview: dir1.lastReview ? new Date(dir1.lastReview) : null,
  });
  const { card: next, log } = scheduleCard(fsrsCard, "Good");
  const updated = cardToDbRow(next);
  const now = Date.now();
  const logId = crypto.randomUUID();

  await localDb.srsCards.update(dir1.id, {
    ...updated,
    dueDate: now,
    lastReview: updated.lastReview?.getTime() ?? null,
    updatedAt: now,
  });
  await localDb.reviewLogs.add({
    id: logId,
    cardId: dir1.id,
    wordId,
    rating: log.rating,
    reviewedAt: log.review.getTime(),
    elapsedDays: log.elapsed_days,
    deviceId: getDeviceId(),
    _synced: 0,
  });

  return { cardId: dir1.id, logId };
}

// ── Sentence attachment ───────────────────────────────────────────────────────

async function attachSentences(wordIds: string[]): Promise<Map<string, LSentence>> {
  if (!wordIds.length) return new Map();

  const links = await localDb.sentenceWords.where("wordId").anyOf(wordIds).toArray();
  const sentenceIdsByWord = new Map<string, string>();
  for (const link of links) {
    if (!sentenceIdsByWord.has(link.wordId)) {
      sentenceIdsByWord.set(link.wordId, link.sentenceId);
    }
  }

  const sentenceIds = [...new Set(sentenceIdsByWord.values())];
  const sentenceRows = await localDb.sentences.bulkGet(sentenceIds);
  const sentenceMap = new Map<string, LSentence>();
  for (const s of sentenceRows) {
    if (s) sentenceMap.set(s.id, s);
  }

  const result = new Map<string, LSentence>();
  for (const [wordId, sentenceId] of sentenceIdsByWord) {
    const s = sentenceMap.get(sentenceId);
    if (s) result.set(wordId, s);
  }
  return result;
}

// ── Review queue (state 1/3 before 2, all due) ───────────────────────────────

export async function buildReviewQueue(deckId: string | null): Promise<ReviewItem[]> {
  const now = Date.now();

  let allCards: LSrsCard[];
  if (deckId) {
    const wds = await localDb.wordDecks.where("deckId").equals(deckId).toArray();
    const wordIds = wds.map((wd) => wd.wordId);
    allCards = await localDb.srsCards.where("wordId").anyOf(wordIds).toArray();
  } else {
    allCards = await localDb.srsCards.toArray();
  }

  // Learning/relearning: always include regardless of dueDate (they're in-progress)
  // Review: only include if due now
  const priority = allCards.filter((c) => c.state === 1 || c.state === 3);
  const review   = allCards.filter((c) => c.state === 2 && c.dueDate <= now);
  const cards    = [...priority, ...review];
  const ordered  = [...priority, ...review];

  const wordIds = [...new Set(ordered.map((c) => c.wordId))];
  const wordRows = await localDb.words.bulkGet(wordIds);
  const wordMap = new Map<string, LWord>();
  for (const w of wordRows) if (w) wordMap.set(w.id, w);

  const sentenceMap = await attachSentences(wordIds);

  const items: ReviewItem[] = [];
  for (const card of ordered) {
    const word = wordMap.get(card.wordId);
    if (word) items.push({ card, word, sentence: sentenceMap.get(card.wordId) ?? null });
  }
  return items;
}

// ── Learn queue (new cards, direction=0 only) ─────────────────────────────────

export async function buildLearnQueue(deckId: string, count: number): Promise<LearningCard[]> {
  const wds = await localDb.wordDecks.where("deckId").equals(deckId).toArray();
  const wordIds = wds.map((wd) => wd.wordId);

  const allNew = await localDb.srsCards
    .where("wordId").anyOf(wordIds)
    .filter((c) => c.state === 0 && c.direction === 0)
    .toArray();

  const selected = allNew.slice(0, count);

  const selectedWordIds = selected.map((c) => c.wordId);
  const wordRows = await localDb.words.bulkGet(selectedWordIds);
  const wordMap = new Map<string, LWord>();
  for (const w of wordRows) if (w) wordMap.set(w.id, w);

  const sentenceMap = await attachSentences(selectedWordIds);

  const items: LearningCard[] = [];
  for (const card of selected) {
    const word = wordMap.get(card.wordId);
    if (word) items.push({ card, word, sentence: sentenceMap.get(card.wordId) ?? null, correctCount: 0 });
  }
  return items;
}

// ── Today's introduced count (for daily limit tracking) ───────────────────────

export async function getNewCardsIntroducedToday(deckId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const wds = await localDb.wordDecks.where("deckId").equals(deckId).toArray();
  const wordIds = new Set(wds.map((wd) => wd.wordId));

  // Count direction=0 cards that were first reviewed today (lastReview today + state != 0)
  const cards = await localDb.srsCards
    .filter((c) => c.direction === 0 && c.state !== 0 && wordIds.has(c.wordId) && (c.lastReview ?? 0) >= todayStartMs)
    .toArray();

  return cards.length;
}

// ── Card counts for dashboard / setup screen ─────────────────────────────────

export async function getDeckCardCounts(deckId: string | null): Promise<DeckCardCounts> {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  let cards: LSrsCard[];
  let wordIds: Set<string> | null = null;

  if (deckId) {
    const wds = await localDb.wordDecks.where("deckId").equals(deckId).toArray();
    wordIds = new Set(wds.map((wd) => wd.wordId));
    cards = await localDb.srsCards.where("wordId").anyOf([...wordIds]).toArray();
  } else {
    cards = await localDb.srsCards.toArray();
  }

  let introducedToday = 0;
  if (deckId && wordIds) {
    introducedToday = cards.filter(
      (c) => c.direction === 0 && c.state !== 0 && (c.lastReview ?? 0) >= todayStartMs
    ).length;
  }

  const newDir0 = cards.filter((c) => c.state === 0 && c.direction === 0);
  const deck = deckId ? await localDb.decks.get(deckId) : null;
  const limit = deck?.dailyNewCardLimit ?? null;
  const remaining = limit != null ? Math.max(0, limit - introducedToday) : newDir0.length;

  return {
    newAvailable: Math.min(newDir0.length, remaining),
    learning:    cards.filter((c) => c.state === 1 || c.state === 3).length,
    dueReview:   cards.filter((c) => c.state === 2 && c.dueDate <= now).length,
  };
}
