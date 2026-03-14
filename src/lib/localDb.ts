/**
 * Client-side offline database using Dexie (IndexedDB).
 *
 * All UI reads/writes go here. The sync engine pushes changes to the server
 * and pulls server changes back. This means the app works fully offline.
 */
import Dexie, { type Table } from "dexie";

// Mirror of server schema, using number timestamps (Unix ms) for IndexedDB compatibility.
// _synced: 0 = pending upload to server, 1 = in sync with server

export interface LWord {
  id: string;
  kanji: string;
  furigana: string;
  meaning: string;
  jlptLevel: number | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  _synced: number;
}

export interface LDeck {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  _synced: number;
}

export interface LWordDeck {
  wordId: string;
  deckId: string;
  _synced: number;
}

export interface LSrsCard {
  id: string;
  wordId: string;
  direction: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  dueDate: number; // Unix ms
  lastReview: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LReviewLog {
  id: string;
  cardId: string;
  wordId: string;
  rating: number;
  reviewedAt: number; // Unix ms
  elapsedDays: number;
  deviceId: string;
  _synced: number; // 0 = needs upload, 1 = confirmed by server
}

export interface LSentence {
  id: string;
  japanese: string;
  english: string;
  source: string;
  tatoebaId: number | null;
  createdAt: number;
  _synced: number;
}

export interface LSentenceWord {
  sentenceId: string;
  wordId: string;
}

export interface LSyncMeta {
  key: string;
  value: string | number | null;
}

class KasokuDb extends Dexie {
  words!: Table<LWord>;
  decks!: Table<LDeck>;
  wordDecks!: Table<LWordDeck>;
  srsCards!: Table<LSrsCard>;
  reviewLogs!: Table<LReviewLog>;
  sentences!: Table<LSentence>;
  sentenceWords!: Table<LSentenceWord>;
  syncMeta!: Table<LSyncMeta>;

  constructor() {
    super("kasoku");
    this.version(1).stores({
      words:         "id, furigana, jlptLevel, updatedAt, _synced",
      decks:         "id, name, updatedAt, _synced",
      wordDecks:     "[wordId+deckId], wordId, deckId, _synced",
      srsCards:      "id, wordId, dueDate, direction, updatedAt",
      reviewLogs:    "id, cardId, reviewedAt, _synced",
      sentences:     "id, tatoebaId, _synced",
      sentenceWords: "[sentenceId+wordId], sentenceId, wordId",
      syncMeta:      "key",
    });
  }
}

export const localDb = typeof window !== "undefined" ? new KasokuDb() : null!;

// ── Sync metadata helpers ─────────────────────────────────────────────────────

export async function getLastSyncAt(): Promise<number | null> {
  const row = await localDb.syncMeta.get("lastSyncAt");
  return row?.value as number | null ?? null;
}

export async function setLastSyncAt(ts: number) {
  await localDb.syncMeta.put({ key: "lastSyncAt", value: ts });
}

export function getDeviceId(): string {
  let id = localStorage.getItem("kasoku_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("kasoku_device_id", id);
  }
  return id;
}
