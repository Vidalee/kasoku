import { NextRequest, NextResponse } from "next/server";

// Uses the free jisho.org API for dictionary lookup
// Returns top results for a given query (Japanese word or English meaning)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Kasoku/1.0 personal Japanese learning app" },
      next: { revalidate: 3600 }, // cache results 1h
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }

    const json = await res.json();
    const data = json.data?.slice(0, 8) ?? [];

    // Normalize to what the frontend needs
    const results = data.map((entry: JishoEntry) => {
      const reading = entry.japanese[0];
      return {
        kanji: reading?.word ?? reading?.reading ?? "",
        furigana: reading?.reading ?? "",
        meaning: entry.senses[0]?.english_definitions?.join(", ") ?? "",
        jlptLevel: parseJlpt(entry.jlpt),
        partOfSpeech: entry.senses[0]?.parts_of_speech ?? [],
      };
    });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}

function parseJlpt(jlpt: string[]): number | null {
  if (!jlpt?.length) return null;
  const levels = jlpt.map((s) => s.match(/n(\d)/)).filter(Boolean).map((m) => parseInt(m![1]));
  return levels.length ? Math.max(...levels) : null;
}

interface JishoEntry {
  japanese: { word?: string; reading?: string }[];
  senses: { english_definitions: string[]; parts_of_speech: string[] }[];
  jlpt: string[];
}
