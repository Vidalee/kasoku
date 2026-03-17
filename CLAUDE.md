# Kasoku — Claude context

Personal Japanese learning PWA. Single user. Built with Next.js 16 + Bun + MUI + SQLite.

## Stack
- **Runtime**: Bun (`bun dev`, `bun run build`, etc.)
- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, MUI v7
- **DB**: SQLite via `@libsql/client` + Drizzle ORM (`src/db/schema.ts` + `src/db/index.ts`)
- **Offline DB**: Dexie.js (IndexedDB) — client-side mirror of server schema (`src/lib/localDb.ts`)
- **Sync**: Custom bidirectional delta sync via `POST /api/sync` (`src/lib/syncEngine.ts`, `src/lib/sync-merge.ts`)
- **SRS**: FSRS via `ts-fsrs` library (`src/lib/fsrs.ts`)
- **Auth**: Single password → bcrypt → JWT cookie (`src/lib/auth.ts`, `src/proxy.ts`)
- **Morphology**: kuromoji.js (client-side, offline)
- **Romaji input**: wanakana.js (auto-converts romaji → hiragana)

## Key commands
```bash
export PATH="$HOME/.bun/bin:$PATH"   # if bun not in PATH
bun dev                               # dev server on :3000
bun run build                         # production build
bun run db:push                       # sync schema to DB (creates kasoku.db)
bun run db:studio                     # drizzle studio UI
bun run seed:vocab                    # seed JLPT N5+N4 vocab
bun run seed:sentences                # seed Tatoeba sentences
```

## Local dev (no Docker, no Postgres needed)
```bash
bun install
bun run db:push      # creates kasoku.db in the project root
bun dev
```
Login password: `kasoku` (dev only — change via AUTH_PASSWORD_HASH in .env.local)

## Project structure
```
src/
  app/                    # Next.js App Router pages + API routes
    api/
      auth/login          # POST — verify password, issue JWT
      auth/logout         # POST — clear cookie
      auth/change-password
      sync/               # POST — bidirectional delta sync
      words/              # GET (list/search), POST (create)
      words/[wordId]/     # GET, PATCH, DELETE
      decks/              # GET, POST
      decks/[deckId]/     # PATCH, DELETE
      review/due          # GET — due cards from server DB
      review/[cardId]/    # POST — record a review
      sentences/          # GET (list + source filter), POST (custom)
      sentences/[sentenceId]/ # DELETE
      words/[wordId]/sentences/ # GET — sentences linked to a word
      stats/              # GET — heatmap, retention, streak
      dashboard/          # GET — summary stats
      jmdict/             # GET — proxy to jisho.org dictionary
      import/anki/analyze/  # POST — parse .apkg (upload or server path)
      import/anki/preview/  # POST — preview notes for selected decks
      import/anki/confirm/  # POST — import words + SRS cards + sentences
    login/                # login page (no auth required)
    learn/                # brute-force word introduction session (Dexie-first)
    vocabulary/           # browse + add words; click card → detail dialog with linked sentences
    review/               # FSRS flashcard session (Dexie-first, offline-capable)
    analyze/              # paste text → kuromoji tokenize → add words
    sentences/            # sentence list; source filter is dynamic from DB
    decks/                # deck management
    import/               # Anki .apkg import wizard (3-step)
    stats/                # progress visualizations
    settings/             # theme, password
  components/
    AppShell.tsx          # retractable sidebar (desktop) + bottom nav (mobile)
    SyncStatus.tsx        # sync status chip shown in sidebar
    WordDialog.tsx        # shared add/edit word dialog
  db/
    schema.ts             # Drizzle schema (drizzle-orm/sqlite-core)
    index.ts              # @libsql/client + drizzle (server-side only)
  lib/
    auth.ts               # JWT helpers
    fsrs.ts               # FSRS wrapper around ts-fsrs
    localDb.ts            # Dexie (IndexedDB) client-side offline DB
    reviewQueue.ts        # queue-building utilities for learn + review sessions
    syncEngine.ts         # client-side sync orchestrator
    sync-merge.ts         # server-side merge logic
    useSync.ts            # React hook: auto-sync on mount + interval
    theme.ts              # MUI light + dark themes
    ThemeContext.tsx       # theme toggle provider
  proxy.ts                # auth guard (Next.js 16 "proxy" = middleware)
  types/
    next-pwa.d.ts         # type shim for next-pwa
scripts/
  seed-vocab.ts           # JLPT N5+N4 from GitHub → SQLite
  seed-sentences.ts       # Tatoeba sentences → SQLite
```

## Database schema (summary)
- `words` — kanji, furigana, meaning, jlpt_level, tags (JSON array)
- `decks` — name, color, daily_new_card_limit (nullable — null means unlimited)
- `word_decks` — word ↔ deck many-to-many
- `srs_cards` — one per (word, direction); direction 0=kanji→meaning, 1=meaning→kana; FSRS fields
- `review_logs` — append-only; one row per review; source of truth for SRS state
- `sentences` — japanese, english, source (tatoeba|custom)
- `sentence_words` — sentence ↔ word many-to-many

## Sync architecture
- **Review logs are append-only** — SRS card state is recomputed by replaying logs in order (FSRS)
- **words/decks**: last-write-wins by `updatedAt`
- **wordDecks, sentenceWords**: always sent in full on every sync (no updatedAt — idempotent)
- **srsCards**: server-authoritative; recomputed from logs after each sync
- **deck deletions**: sync response includes `allDeckIds`; client prunes any local deck not in that list
- Client uses `_synced: 0/1` flag in Dexie to track unsynced records
- `deviceId` in review logs for per-device attribution
- Fire-and-forget `POST /api/review/[cardId]` uses the same `logId` as the Dexie log — server uses `onConflictDoNothing` so sync never double-counts

## Auth
- Password stored as bcrypt hash in env var `AUTH_PASSWORD_HASH`
- Generate new hash: `bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('yourpassword', 12))"`
- JWT secret in `JWT_SECRET` env var

## Env vars
See `.env.local` for all required vars. Never commit `.env` or `.env.local`.
- `DATABASE_PATH` — path to SQLite file (default: `./kasoku.db`)
- `AUTH_PASSWORD_HASH` — bcrypt hash of login password
- `JWT_SECRET` — JWT signing secret

## Git
- All commits must follow **Conventional Commits**: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `perf`, `test`
- Examples: `feat(analyze): auto-fetch meanings from jisho`, `fix(vocab): remove debounce on initial load`

## Anki import
- Accepts `.apkg` files via browser upload (streamed to disk, never buffered) or server-side path
- `node-stream-zip` extracts only `collection.anki21` (or `.anki2`) without loading the full zip into memory
- `proxyClientMaxBodySize: "200mb"` in `next.config.ts` raises the middleware body limit for large uploads
- Import mapping: kanji/word field, reading field, meaning field, optional sentences field
- Kana-only words (empty kanji field) fall back to reading as the word
- Duplicate words (same kanji+reading) are not re-created — existing word is added to the new deck instead
- Optional JLPT level tag applied to all newly created words at import time
- Imported sentences stored with deck name as source; linked to word via `sentence_words`
- HTML fields are stripped with `extractPrimary()`: removes `<details>` alternates, `<rt>` ruby, `<ul>` labels, then takes first span content

## Notes
- `next-pwa` uses webpack; Turbopack is configured with empty `turbopack: {}` to coexist
- All DB access is server-side only (API routes). Client never imports from `src/db/`
- `bun:sqlite` is NOT used (incompatible with Next.js build workers); use `@libsql/client` instead
- kuromoji dictionary files are large; they load async on first use
- SQLite file is `kasoku.db` in project root for dev; set `DATABASE_PATH` for production
