import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { sessionId, selectedDeckIds } = await req.json();
  if (!sessionId || !selectedDeckIds?.length) {
    return NextResponse.json({ error: "Missing sessionId or selectedDeckIds" }, { status: 400 });
  }

  const collectionPath = path.join(tmpdir(), `kasoku-import-${sessionId}`, "collection.db");
  if (!existsSync(collectionPath)) {
    return NextResponse.json({ error: "Session expired — please re-upload the file" }, { status: 404 });
  }

  const client = createClient({ url: `file:${collectionPath}` });

  const colResult = await client.execute("SELECT models FROM col LIMIT 1");
  const modelsRaw = colResult.rows[0].models as string;

  let noteTypes: { id: string; fields: string[] }[] = [];
  if (modelsRaw && modelsRaw !== "{}") {
    const modelsJson: Record<string, AnkiModel> = JSON.parse(modelsRaw);
    noteTypes = Object.values(modelsJson).map((m) => ({
      id: String(m.id),
      fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
    }));
  }

  const deckIdList = selectedDeckIds.map((id: string) => `'${id}'`).join(",");

  // 5 notes from selected decks, sampling across note types
  const preview: { fields: Record<string, string> }[] = [];
  const sampleRes = await client.execute(
    `SELECT DISTINCT n.mid, n.flds FROM notes n
     JOIN cards c ON c.nid = n.id
     WHERE c.did IN (${deckIdList})
     GROUP BY n.mid, n.id
     LIMIT 5`
  );
  for (const row of sampleRes.rows) {
    const nt = noteTypes.find((m) => m.id === String(row.mid));
    if (!nt) continue;
    const vals = (row.flds as string).split("\x1f");
    const fields: Record<string, string> = {};
    nt.fields.forEach((name, i) => { fields[name] = extractPrimary(vals[i] ?? ""); });
    preview.push({ fields });
  }

  client.close();
  return NextResponse.json({ preview });
}

function extractPrimary(html: string): string {
  if (!html) return "";
  html = html.replace(/\[sound:[^\]]+\]/g, "");
  html = html.replace(/<details[\s\S]*?<\/details>/g, "");
  html = html.replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<\/?ruby>|<\/?rb>/g, "");
  html = html.replace(/<ul[\s\S]*?<\/ul>/g, "");
  const spanMatch = html.match(/<span[^>]*>([^<]+)<\/span>/);
  if (spanMatch) {
    const text = spanMatch[1].trim();
    if (text && !/^\(no /.test(text)) return text;
    return "";
  }
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

interface AnkiModel { id: number; name: string; flds: { name: string; ord: number }[]; }
