#!/bin/sh
set -e

if [ ! -f "$DATABASE_PATH" ]; then
  echo "Fresh database — running db:push..."
  bun run db:push
fi

exec bun server.js
