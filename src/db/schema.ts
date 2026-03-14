import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

function id() {
  return text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
}
function now() {
  return integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());
}

// ─── Decks ────────────────────────────────────────────────────────────────────

export const decks = sqliteTable("decks", {
  id: id(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6750A4"),
  createdAt: now(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Words ────────────────────────────────────────────────────────────────────

export const words = sqliteTable(
  "words",
  {
    id: id(),
    kanji: text("kanji").notNull(),
    furigana: text("furigana").notNull(),
    meaning: text("meaning").notNull(),
    jlptLevel: integer("jlpt_level"),
    // SQLite has no array type — store as JSON
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("words_kanji_idx").on(t.kanji)]
);

// ─── Word ↔ Deck ──────────────────────────────────────────────────────────────

export const wordDecks = sqliteTable(
  "word_decks",
  {
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.deckId] })]
);

// ─── SRS Cards ────────────────────────────────────────────────────────────────
// direction: 0 = kanji→meaning, 1 = meaning→kana
// State is derived by replaying review_logs — this is the cached current state.

export const srsCards = sqliteTable(
  "srs_cards",
  {
    id: id(),
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    direction: integer("direction").notNull().default(0),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    state: integer("state").notNull().default(0),
    dueDate: integer("due_date", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastReview: integer("last_review", { mode: "timestamp" }),
    createdAt: now(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("srs_cards_due_idx").on(t.dueDate),
    index("srs_cards_word_dir_idx").on(t.wordId, t.direction),
  ]
);

// ─── Review Logs (append-only) ────────────────────────────────────────────────
// Never updated after insert. The source of truth for SRS state.
// Card state can always be recomputed by replaying logs in reviewedAt order.

export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: id(),
    cardId: text("card_id")
      .notNull()
      .references(() => srsCards.id, { onDelete: "cascade" }),
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
    rating: integer("rating").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    // which device submitted this review — used for deduplication on sync
    deviceId: text("device_id").notNull().default("server"),
  },
  (t) => [index("review_logs_reviewed_at_idx").on(t.reviewedAt)]
);

// ─── Sentences ────────────────────────────────────────────────────────────────

export const sentences = sqliteTable(
  "sentences",
  {
    id: id(),
    japanese: text("japanese").notNull(),
    english: text("english").notNull(),
    source: text("source").notNull().default("custom"),
    tatoebaId: integer("tatoeba_id"),
    createdAt: now(),
  },
  (t) => [index("sentences_tatoeba_id_idx").on(t.tatoebaId)]
);

// ─── Sentence ↔ Word ─────────────────────────────────────────────────────────

export const sentenceWords = sqliteTable(
  "sentence_words",
  {
    sentenceId: text("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sentenceId, t.wordId] })]
);
