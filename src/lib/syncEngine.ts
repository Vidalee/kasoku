/**
 * Sync engine — bidirectional delta sync between localDb (Dexie) and server.
 *
 * Protocol:
 *   1. Collect unsynced local changes (review_logs, words, decks, sentences)
 *   2. POST /api/sync with { clientId, lastSyncAt, changes }
 *   3. Server merges changes, recomputes SRS card states from logs
 *   4. Server returns { syncedAt, serverChanges }
 *   5. We merge serverChanges into localDb
 */

import {
  localDb,
  getLastSyncAt,
  setLastSyncAt,
  getDeviceId,
  type LWord,
  type LDeck,
  type LWordDeck,
  type LReviewLog,
  type LSrsCard,
  type LSentence,
  type LSentenceWord,
} from "./localDb";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

export interface SyncPayload {
  clientId: string;
  lastSyncAt: number | null;
  changes: {
    words: LWord[];
    decks: LDeck[];
    wordDecks: LWordDeck[];
    reviewLogs: LReviewLog[];
    sentences: LSentence[];
    sentenceWords: LSentenceWord[];
  };
}

export interface SyncResponse {
  syncedAt: number;
  serverChanges: {
    words: LWord[];
    decks: LDeck[];
    allDeckIds: string[];
    wordDecks: LWordDeck[];
    srsCards: LSrsCard[];
    reviewLogs: LReviewLog[];
    sentences: LSentence[];
    sentenceWords: LSentenceWord[];
  };
}

let syncing = false;

export async function runSync(): Promise<SyncStatus> {
  if (syncing) return "syncing";
  if (!navigator.onLine) return "offline";

  syncing = true;
  try {
    const clientId = getDeviceId();
    const lastSyncAt = await getLastSyncAt();

    // Collect all unsynced local changes
    const [unsyncedWords, unsyncedDecks, unsyncedWordDecks, unsyncedLogs, unsyncedSentences, unsyncedSentenceWords] =
      await Promise.all([
        localDb.words.where("_synced").equals(0).toArray(),
        localDb.decks.where("_synced").equals(0).toArray(),
        localDb.wordDecks.where("_synced").equals(0).toArray(),
        localDb.reviewLogs.where("_synced").equals(0).toArray(),
        localDb.sentences.where("_synced").equals(0).toArray(),
        // sentence_words have no _synced — send ones linked to unsynced sentences
        localDb.sentenceWords
          .where("sentenceId")
          .anyOf(unsyncedSentenceIds(await localDb.sentences.where("_synced").equals(0).toArray()))
          .toArray(),
      ]);

    const payload: SyncPayload = {
      clientId,
      lastSyncAt,
      changes: {
        words: unsyncedWords,
        decks: unsyncedDecks,
        wordDecks: unsyncedWordDecks,
        reviewLogs: unsyncedLogs,
        sentences: unsyncedSentences,
        sentenceWords: unsyncedSentenceWords,
      },
    };

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

    const { syncedAt, serverChanges }: SyncResponse = await res.json();

    // Merge server changes into local DB
    await localDb.transaction("rw", [
      localDb.words, localDb.decks, localDb.wordDecks,
      localDb.srsCards, localDb.reviewLogs, localDb.sentences,
      localDb.sentenceWords, localDb.syncMeta,
    ], async () => {
      // Words — last-write-wins by updatedAt
      for (const w of serverChanges.words) {
        const existing = await localDb.words.get(w.id);
        if (!existing || existing.updatedAt <= w.updatedAt) {
          await localDb.words.put({ ...w, _synced: 1 });
        }
      }

      // Decks — upsert changed, then delete any local deck the server no longer has
      for (const d of serverChanges.decks) {
        await localDb.decks.put({ ...d, _synced: 1 });
      }
      if (serverChanges.allDeckIds) {
        const serverIdSet = new Set(serverChanges.allDeckIds);
        const localDecks = await localDb.decks.toArray();
        const toDelete = localDecks.filter((d) => !serverIdSet.has(d.id)).map((d) => d.id);
        if (toDelete.length) await localDb.decks.bulkDelete(toDelete);
      }

      // WordDecks — additive only
      for (const wd of serverChanges.wordDecks) {
        await localDb.wordDecks.put({ ...wd, _synced: 1 });
      }

      // SRS cards — server is authoritative (recomputed from logs)
      for (const c of serverChanges.srsCards) {
        await localDb.srsCards.put(c);
      }

      // Review logs — append-only, insert missing
      for (const log of serverChanges.reviewLogs) {
        const exists = await localDb.reviewLogs.get(log.id);
        if (!exists) await localDb.reviewLogs.put({ ...log, _synced: 1 });
      }

      // Sentences — additive
      for (const s of serverChanges.sentences) {
        await localDb.sentences.put({ ...s, _synced: 1 });
      }
      for (const sw of serverChanges.sentenceWords) {
        await localDb.sentenceWords.put(sw);
      }

      // Mark all local unsynced records as synced
      await Promise.all([
        ...unsyncedWords.map((w) => localDb.words.update(w.id, { _synced: 1 })),
        ...unsyncedDecks.map((d) => localDb.decks.update(d.id, { _synced: 1 })),
        ...unsyncedLogs.map((l) => localDb.reviewLogs.update(l.id, { _synced: 1 })),
        ...unsyncedSentences.map((s) => localDb.sentences.update(s.id, { _synced: 1 })),
      ]);

      await setLastSyncAt(syncedAt);
    });

    return "idle";
  } catch (e) {
    console.error("Sync error:", e);
    return "error";
  } finally {
    syncing = false;
  }
}

function unsyncedSentenceIds(sentences: { id: string }[]) {
  return sentences.map((s) => s.id);
}
