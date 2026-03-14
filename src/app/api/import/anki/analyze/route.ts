import { NextRequest, NextResponse } from "next/server";
import StreamZip from "node-stream-zip";
import { createClient } from "@libsql/client";
import { createWriteStream, mkdirSync, existsSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionId = crypto.randomUUID();
  const tempDir = path.join(tmpdir(), `kasoku-import-${sessionId}`);

  try {
    mkdirSync(tempDir, { recursive: true });

    const contentType = req.headers.get("content-type") ?? "";
    const apkgPath = path.join(tempDir, "upload.apkg");

    if (contentType.includes("application/json")) {
      // Server-side path mode — symlink so we don't copy 93MB unnecessarily
      const { filePath } = await req.json();
      if (!filePath || !String(filePath).endsWith(".apkg")) {
        return NextResponse.json({ error: "Please provide a path to an .apkg file" }, { status: 400 });
      }
      if (!existsSync(filePath)) {
        return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 400 });
      }
      // Use the original path directly
      return await analyzeFile(filePath, sessionId, tempDir);
    } else {
      // Upload mode — stream directly to disk, never buffer in memory
      const filename = req.headers.get("x-filename") ?? "";
      if (!filename.endsWith(".apkg")) {
        return NextResponse.json({ error: "Please upload a .apkg file" }, { status: 400 });
      }
      if (!req.body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

      // Use native web-stream pipeTo — avoids Readable.fromWeb truncation issues in Turbopack
      const fileStream = createWriteStream(apkgPath);
      await req.body.pipeTo(new WritableStream({
        write(chunk) {
          return new Promise<void>((resolve, reject) => {
            if (fileStream.write(chunk)) { resolve(); }
            else { fileStream.once("drain", resolve); fileStream.once("error", reject); }
          });
        },
        close() {
          return new Promise<void>((resolve, reject) =>
            fileStream.end((err: Error | null) => err ? reject(err) : resolve())
          );
        },
        abort(err: unknown) { fileStream.destroy(err instanceof Error ? err : new Error(String(err))); },
      }));

      const { size } = statSync(apkgPath);
      console.log(`[import] upload written: ${size} bytes`);
      return await analyzeFile(apkgPath, sessionId, tempDir);
    }
  } catch (err) {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Anki analyze error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function analyzeFile(apkgPath: string, sessionId: string, tempDir: string): Promise<Response> {
  // Open zip lazily — reads central directory only, no full-file buffering
  const zip = new StreamZip.async({ file: apkgPath });

  try {
    const entries = await zip.entries();
    const entryName = entries["collection.anki21"] ? "collection.anki21"
                    : entries["collection.anki2"]  ? "collection.anki2"
                    : null;
    if (!entryName) {
      return NextResponse.json({ error: "Invalid .apkg — no collection found inside" }, { status: 400 });
    }

    // Extract just the SQLite db to disk, streaming (never fully in memory)
    const collectionPath = path.join(tempDir, "collection.db");
    await zip.extract(entryName, collectionPath);
    await zip.close();

    const client = createClient({ url: `file:${collectionPath}` });

    const colResult = await client.execute("SELECT decks, models FROM col LIMIT 1");
    const colRow = colResult.rows[0];

    const decksJson: Record<string, AnkiDeck> = JSON.parse(colRow.decks as string);

    // models may be in col.models (older) or in a separate notetypes table (Anki 2.1.28+)
    let noteTypes: NoteType[] = [];
    const modelsRaw = colRow.models as string;
    if (modelsRaw && modelsRaw !== "{}") {
      const modelsJson: Record<string, AnkiModel> = JSON.parse(modelsRaw);
      noteTypes = Object.values(modelsJson).map((m) => ({
        id: String(m.id),
        name: m.name,
        fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
      }));
    } else {
      try {
        const ntRes = await client.execute("SELECT id, name FROM notetypes");
        const fieldsRes = await client.execute("SELECT ntid, name, ord FROM fields ORDER BY ntid, ord");
        const fieldsByNt: Record<string, string[]> = {};
        for (const row of fieldsRes.rows) {
          const ntid = String(row.ntid);
          if (!fieldsByNt[ntid]) fieldsByNt[ntid] = [];
          fieldsByNt[ntid][Number(row.ord)] = row.name as string;
        }
        noteTypes = ntRes.rows.map((row) => ({
          id: String(row.id),
          name: row.name as string,
          fields: fieldsByNt[String(row.id)] ?? [],
        }));
      } catch { /* leave noteTypes empty */ }
    }

    // Cards per deck
    const cardCountRes = await client.execute("SELECT did, COUNT(*) as cnt FROM cards GROUP BY did");
    const cardCounts: Record<string, number> = {};
    for (const row of cardCountRes.rows) cardCounts[String(row.did)] = Number(row.cnt);

    const decks = Object.values(decksJson)
      .filter((d) => d.id !== 1 && (cardCounts[String(d.id)] ?? 0) > 0)
      .map((d) => ({ id: String(d.id), name: d.name, cardCount: cardCounts[String(d.id)] ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // One note per note type for the initial preview (before deck selection)
    const preview: { fields: Record<string, string> }[] = [];
    for (const nt of noteTypes) {
      const row = await client.execute(`SELECT flds FROM notes WHERE mid = ${nt.id} LIMIT 1`);
      if (!row.rows[0]) continue;
      const vals = (row.rows[0].flds as string).split("\x1f");
      const fields: Record<string, string> = {};
      nt.fields.forEach((name, i) => { fields[name] = extractPrimary(vals[i] ?? ""); });
      preview.push({ fields });
    }

    const totalRes = await client.execute("SELECT COUNT(DISTINCT nid) as cnt FROM cards");
    const totalNotes = Number(totalRes.rows[0].cnt);

    client.close();

    return NextResponse.json({ sessionId, decks, noteTypes, totalNotes, preview });
  } catch (err) {
    try { await zip.close(); } catch {}
    throw err;
  }
}

/** Extract the primary (first) value from structured Anki HTML fields.
 *  Handles ruby furigana, collapsible alternative forms, and note-list labels. */
function extractPrimary(html: string): string {
  if (!html) return "";
  html = html.replace(/\[sound:[^\]]+\]/g, "");
  // Drop alternative forms (<details> = "Show other readings / kanji forms")
  html = html.replace(/<details[\s\S]*?<\/details>/g, "");
  // Ruby: keep base character, drop pronunciation  (<ruby><rb>漢字</rb><rt>かんじ</rt></ruby>)
  html = html.replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<\/?ruby>|<\/?rb>/g, "");
  // Drop note/label lists
  html = html.replace(/<ul[\s\S]*?<\/ul>/g, "");
  // Take first span's text content
  const spanMatch = html.match(/<span[^>]*>([^<]+)<\/span>/);
  if (spanMatch) {
    const text = spanMatch[1].trim();
    if (text && !/^\(no /.test(text)) return text;
    return "";  // "(no kanji forms)" etc → empty
  }
  // Fallback: strip all tags
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

interface AnkiDeck { id: number; name: string; }
interface AnkiModel { id: number; name: string; flds: { name: string; ord: number }[]; }
interface NoteType { id: string; name: string; fields: string[]; }
