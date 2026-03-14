import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "kasoku.db");

const client = createClient({ url: `file:${DB_PATH}` });

// Configure SQLite pragmas on first use
void client.execute("PRAGMA journal_mode=WAL").catch(() => {});
void client.execute("PRAGMA foreign_keys=ON").catch(() => {});

export const db = drizzle(client, { schema });
export * from "./schema";
