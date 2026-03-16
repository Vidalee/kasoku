# 加速 Kasoku

[![Build](https://github.com/Vidalee/kasoku/actions/workflows/build.yml/badge.svg)](https://github.com/Vidalee/kasoku/actions/workflows/build.yml)
[![Deployed](https://img.shields.io/github/v/tag/Vidalee/kasoku?label=deployed&color=blue)](https://github.com/Vidalee/kasoku/releases)

**An experiment to see whether a tool designed around how I feel I learn best can actually be effective, and how useful a fully “vibe-coded” app can be.**

Personal Japanese learning PWA. Vocabulary management, spaced repetition (FSRS), sentence reading practice, offline-first with multi-device sync.

## Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- That's it — no Docker needed for local dev

## First-time setup

**1. Clone and install**
```bash
git clone <your-repo>
cd kasoku
bun install
```

**2. Configure environment**

`.env.local` is pre-filled for local dev. The default login password is **`kasoku`**.

To set your own password:
```bash
bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('yourpassword', 12))"
```
Then set `AUTH_PASSWORD_HASH=<output>` in `.env.local`.

**3. Create the database and start**
```bash
bun run db:push   # creates kasoku.db with all tables
bun dev           # http://localhost:3000
```

## Running on another PC

```bash
bun install
bun run db:push
bun dev
```

That's it. Each machine gets its own `kasoku.db` and they sync through the server.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on :3000 |
| `bun run build` | Production build |
| `bun run db:push` | Sync schema to SQLite (creates kasoku.db if needed) |
| `bun run db:studio` | Drizzle Studio — visual DB browser |
| `bun run seed:vocab` | Import JLPT N5 + N4 vocabulary (~1300 words) |
| `bun run seed:sentences` | Import Tatoeba sentences filtered to your vocab |
| `bun run seed:all` | Run both seed scripts |

## Seeding data

After `db:push`, seed your initial vocabulary:
```bash
bun run seed:vocab       # imports ~1300 JLPT N5+N4 words from GitHub
bun run seed:sentences   # imports Tatoeba sentences matching your vocab
```

The sentence seed only imports sentences where at least one word is in your vocabulary. Run it again after adding more words — it's idempotent.

## Production (VPS)

The image is built and pushed to GHCR by CI. On the VPS:

```bash
# 1. Copy and fill in the production env
cp .env.production.template .env
# Edit .env — set JWT_SECRET and AUTH_PASSWORD_HASH

# 2. Pull and start
docker compose pull
docker compose up -d

# 3. First-time only: push schema and seed
docker compose exec app bun run db:push
docker compose exec app bun run seed:all
```

Set up a reverse proxy (port 3000) and TLS on the VPS side.

The SQLite database is mounted as a Docker volume (`kasoku_data`) and persists across deploys.

### Subsequent deploys

CI builds the image and pushes to GHCR. On the VPS:
```bash
docker compose pull && docker compose up -d
```
This is handled automatically by the GitHub Actions pipeline.

## Pages

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | Daily review count, streak |
| Review | `/review` | FSRS flashcard session (offline-capable) |
| Vocabulary | `/vocabulary` | Browse, search, add words; click any word to see linked sentences |
| Sentences | `/sentences` | Sentence list with source filter |
| Analyze | `/analyze` | Paste text → tokenize → add words |
| Decks | `/decks` | Manage word decks |
| Import | `/import` | Import vocabulary from Anki `.apkg` files |
| Stats | `/stats` | Progress graphs + heatmap |
| Settings | `/settings` | Theme, change password |

## Importing from Anki

Go to **Import** and upload any `.apkg` file (or point to a server path for large files). The wizard lets you:
- Pick which sub-decks to import
- Map Anki fields → Kasoku fields (word, reading, meaning, example sentences)
- Tag all imported words with a JLPT level
- Preview sample cards before committing

Duplicate words (same word + reading already in your vocab) are skipped but still added to the new deck. SRS progress is preserved.

## Stack

- Next.js 16 (App Router) + React 19 + MUI v7
- Bun runtime + package manager
- SQLite via `@libsql/client` + Drizzle ORM
- Dexie.js (IndexedDB) for offline-first client storage
- Bidirectional delta sync — review logs are append-only, SRS state recomputed from logs
- FSRS via `ts-fsrs` — spaced repetition algorithm
- kuromoji.js — Japanese morphological analysis (offline)
- wanakana.js — romaji → hiragana conversion
- next-pwa — installable PWA (Android)
