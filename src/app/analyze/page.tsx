"use client";

import { useState, useRef, useEffect } from "react";
import {
  Box, Typography, Button, TextField, Stack, Chip, CircularProgress,
  Card, CardContent, Divider, Alert, Snackbar, Popover,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import { WordDialog, type JishoResult, type Deck } from "@/components/WordDialog";

interface Token {
  surface: string;
  reading: string;
  baseForm: string;
  pos: string;
  unknown: boolean;
  inVocab?: boolean;
  wordId?: string;
  meaning?: string;           // vocab meaning or first jisho meaning
  jishoResult?: JishoResult | null; // null = fetched, not found
}

interface KuromojiToken {
  surface_form: string;
  reading?: string;
  basic_form?: string;
  pos?: string;
}

// ── Particle usage descriptions ────────────────────────────────────────────
const PARTICLE_USAGE: Record<string, string> = {
  "は": "Topic marker — marks the topic of the sentence",
  "が": "Subject marker — marks the grammatical subject; also used for contrast",
  "を": "Object marker — marks the direct object",
  "に": "Direction, location, point in time, or indirect object",
  "で": "Location of action, means, method, or reason",
  "と": "And (listing), with, or quotation marker",
  "も": "Also, too, or even",
  "の": "Possession, nominalization, or explanatory",
  "から": "From, because, or since",
  "まで": "Until, up to, or as far as",
  "より": "Than, or from (formal)",
  "へ": "Toward — direction marker",
  "か": "Question marker",
  "ね": "Seeking agreement or softening a statement",
  "よ": "Assertion — conveying new information",
  "な": "Prohibition (don't ~) or casual sentence-final particle",
  "ぞ": "Strong assertion (masculine, casual)",
  "ぜ": "Casual assertion",
  "わ": "Sentence-final softener (feminine)",
  "し": "Listing reasons",
  "ので": "Because / since (polite)",
  "のに": "Even though / despite",
  "けど": "But / although (casual)",
  "けれど": "But / although",
  "て": "Te-form connector — sequence, cause, or manner",
  "ば": "Conditional — if ~",
  "だけ": "Only / just",
  "しか": "Only (used with negative) — nothing but",
  "ほど": "About / to the extent that",
  "ごろ": "Around (approximate time)",
  "くらい": "About / approximately",
  "ぐらい": "About / approximately",
  "ながら": "While doing ~",
};

// ── Punctuation filter ──────────────────────────────────────────────────────
const PUNCT_RE = /^[、。，．・「」『』【】〔〕〈〉《》…‥～〜！？!?,.:;()\[\]{}\s]+$/;

function isPunctuation(token: { pos: string; surface: string }): boolean {
  return (
    token.pos === "BOS/EOS" ||
    token.pos.startsWith("記号") ||
    token.surface.trim() === "" ||
    PUNCT_RE.test(token.surface)
  );
}

function toHiragana(str: string) {
  return str.replace(/[\u30A1-\u30F6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

// ── Kuromoji (cached) ───────────────────────────────────────────────────────
let cachedTokenizer: { tokenize: (t: string) => KuromojiToken[] } | null = null;

async function getTokenizer() {
  if (cachedTokenizer) return cachedTokenizer;
  const kuromoji = (await import("kuromoji")).default;
  return new Promise<{ tokenize: (t: string) => KuromojiToken[] }>((resolve, reject) => {
    kuromoji.builder({ dicPath: "/kuromoji/dict" }).build((err, tokenizer) => {
      if (err) return reject(err as Error);
      cachedTokenizer = tokenizer;
      resolve(tokenizer);
    });
  });
}

function tokenizeWith(tokenizer: { tokenize: (t: string) => KuromojiToken[] }, text: string): Token[] {
  return tokenizer
    .tokenize(text)
    .map((t) => ({
      surface: t.surface_form,
      reading: t.reading ? toHiragana(t.reading) : t.surface_form,
      baseForm: t.basic_form || t.surface_form,
      pos: t.pos || "unknown",
      unknown: false,
    }))
    .filter((t) => !isPunctuation(t));
}

async function tokenizeSentences(text: string): Promise<Token[][]> {
  const tokenizer = await getTokenizer();
  const parts = text.split(/(?<=[。！？!?]+)/).map((s) => s.trim()).filter(Boolean);
  const sentences = parts.length > 0 ? parts : [text];
  return sentences.map((s) => tokenizeWith(tokenizer, s));
}

// ── Jisho rate-limited queue (10 req / 10 s) ───────────────────────────────
const jishoQueue: Array<{ query: string; resolve: (r: JishoResult | null) => void }> = [];
let jishoRequestTimes: number[] = [];
let jishoQueueRunning = false;

function enqueueJisho(query: string): Promise<JishoResult | null> {
  return new Promise((resolve) => {
    jishoQueue.push({ query, resolve });
    if (!jishoQueueRunning) drainJishoQueue();
  });
}

async function drainJishoQueue() {
  jishoQueueRunning = true;
  while (jishoQueue.length > 0) {
    const now = Date.now();
    jishoRequestTimes = jishoRequestTimes.filter((t) => now - t < 10000);
    if (jishoRequestTimes.length >= 10) {
      const waitMs = 10000 - (now - jishoRequestTimes[0]) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const item = jishoQueue.shift()!;
    jishoRequestTimes.push(Date.now());
    try {
      const res = await fetch(`/api/jmdict?q=${encodeURIComponent(item.query)}`);
      const data = await res.json();
      item.resolve(data.results?.[0] ?? null);
    } catch {
      item.resolve(null);
    }
  }
  jishoQueueRunning = false;
}

// ── POS helpers ─────────────────────────────────────────────────────────────
const POS_COLORS: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info"> = {
  "名詞": "primary",
  "動詞": "success",
  "形容詞": "warning",
  "助詞": "default",
  "助動詞": "default",
  "副詞": "info",
  "接続詞": "secondary",
};

function posColor(pos: string) { return POS_COLORS[pos] ?? "default"; }

function posLabel(pos: string) {
  const map: Record<string, string> = {
    "名詞": "noun", "動詞": "verb", "形容詞": "adj",
    "助詞": "particle", "助動詞": "aux", "副詞": "adv",
    "接続詞": "conj", "感動詞": "interj",
  };
  return map[pos] ?? pos;
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AnalyzePage() {
  const [input, setInput] = useState("");
  const [sentences, setSentences] = useState<Token[][]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dictLoading, setDictLoading] = useState(false);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [savingSentence, setSavingSentence] = useState(false);
  const [sentenceSaved, setSentenceSaved] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogToken, setAddDialogToken] = useState<Token | null>(null);
  const addedRef = useRef<Set<string>>(new Set());
  const analysisIdRef = useRef(0);

  useEffect(() => {
    fetch("/api/decks").then((r) => r.json()).then((d) => setDecks(d.decks ?? []));
  }, []);

  const tokens = sentences.flat();

  async function handleSaveSentence() {
    const knownWordIds = tokens.filter((t) => t.inVocab && t.wordId).map((t) => t.wordId!);
    if (!knownWordIds.length) return;
    setSavingSentence(true);
    const english = window.prompt("Enter the English translation for this sentence:");
    if (!english) { setSavingSentence(false); return; }
    await fetch("/api/sentences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ japanese: currentInput, english, wordIds: knownWordIds }),
    });
    setSavingSentence(false);
    setSentenceSaved(true);
    setSnackbar("Sentence saved to your sentence bank!");
  }

  async function handleAnalyze() {
    if (!input.trim()) return;
    setAnalyzing(true);
    setError("");
    setSentences([]);
    setSentenceSaved(false);
    setCurrentInput(input.trim());
    const analysisId = ++analysisIdRef.current;

    try {
      setDictLoading(true);
      const rawSentences = await tokenizeSentences(input.trim());
      setDictLoading(false);

      const allRaw = rawSentences.flat();
      const readings = [...new Set(allRaw.map((t) => t.reading))];
      const res = await fetch("/api/words/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings }),
      });
      const { known } = await res.json() as { known: { furigana: string; id: string; meaning: string }[] };
      const knownMap = Object.fromEntries(known.map((k) => [k.furigana, { id: k.id, meaning: k.meaning }]));

      const enrich = (t: Token): Token => {
        const isParticle = t.pos === "助詞" || t.pos === "助動詞";
        const entry = knownMap[t.reading];
        return {
          ...t,
          inVocab: !!entry || addedRef.current.has(t.reading),
          wordId: entry?.id,
          meaning: entry?.meaning,
          unknown: !isParticle && !entry && !addedRef.current.has(t.reading),
        };
      };

      const enriched = rawSentences.map((s) => s.map(enrich));
      setSentences(enriched);

      // Fetch Jisho meanings for unknown tokens in background
      fetchJishoMeanings(enriched, analysisId);
    } catch (e) {
      setError("Failed to analyze. kuromoji dictionary may still be loading.");
      console.error(e);
    }
    setAnalyzing(false);
    setDictLoading(false);
  }

  async function fetchJishoMeanings(enrichedSentences: Token[][], analysisId: number) {
    const seen = new Set<string>();
    const toLookup: Token[] = [];
    for (const token of enrichedSentences.flat()) {
      if (!token.unknown) continue; // vocab words already have meaning; particles skipped
      if (seen.has(token.baseForm)) continue;
      seen.add(token.baseForm);
      toLookup.push(token);
    }

    for (const token of toLookup) {
      if (analysisIdRef.current !== analysisId) return; // stale analysis
      const result = await enqueueJisho(token.baseForm);
      if (analysisIdRef.current !== analysisId) return;
      setSentences((prev) =>
        prev.map((s) =>
          s.map((t) =>
            t.baseForm === token.baseForm
              ? { ...t, meaning: result?.meaning, jishoResult: result ?? null }
              : t
          )
        )
      );
    }
  }

  function openAddDialog(token: Token) {
    setAddDialogToken(token);
    setAddDialogOpen(true);
  }

  function handleWordSaved() {
    if (addDialogToken) {
      addedRef.current.add(addDialogToken.reading);
      setSentences((prev) =>
        prev.map((s) =>
          s.map((t) =>
            t.reading === addDialogToken.reading ? { ...t, inVocab: true, unknown: false } : t
          )
        )
      );
    }
    setAddDialogOpen(false);
    setAddDialogToken(null);
    setSnackbar("Word added to vocabulary!");
  }

  const addPrefill = addDialogToken
    ? {
        kanji: addDialogToken.baseForm,
        furigana: addDialogToken.reading,
        meaning: addDialogToken.meaning ?? addDialogToken.jishoResult?.meaning ?? "",
        jlptLevel: addDialogToken.jishoResult?.jlptLevel ?? null,
      }
    : null;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} mb={1}>Analyze text</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Paste Japanese text to tokenize it. Unknown words are highlighted — add them to your vocabulary in one click.
      </Typography>

      <Stack gap={2} mb={3}>
        <TextField
          multiline rows={4} fullWidth
          placeholder="今日は東京に行きます。天気がいいですね。"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputProps={{ lang: "ja" }}
        />
        <Button
          variant="contained"
          onClick={handleAnalyze}
          disabled={analyzing || !input.trim()}
          sx={{ alignSelf: "flex-start" }}
        >
          {analyzing ? (
            <><CircularProgress size={16} sx={{ mr: 1 }} />{dictLoading ? "Loading dictionary…" : "Analyzing…"}</>
          ) : "Analyze"}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {sentences.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" gap={1} mb={2} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary">Legend:</Typography>
              <Chip size="small" label="noun" color="primary" variant="outlined" />
              <Chip size="small" label="verb" color="success" variant="outlined" />
              <Chip size="small" label="adj" color="warning" variant="outlined" />
              <Chip size="small" label="particle" variant="outlined" />
              <Chip size="small" label="unknown word" color="error" variant="filled" />
              <Chip size="small" label="in vocab" color="success" variant="filled" icon={<CheckCircleIcon />} />
            </Stack>
            <Divider sx={{ mb: 2 }} />

            <Stack gap={2}>
              {sentences.map((sentence, si) => (
                <Box key={si}>
                  {si > 0 && <Divider sx={{ mb: 2 }} />}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "flex-end" }}>
                    {sentence.map((token, i) => (
                      <TokenChip key={i} token={token} onAdd={() => openAddDialog(token)} />
                    ))}
                  </Box>
                </Box>
              ))}
            </Stack>

            <Stack direction="row" alignItems="center" justifyContent="space-between" mt={3} flexWrap="wrap" gap={1}>
              <Typography variant="caption" color="text.secondary">
                {tokens.filter((t) => t.inVocab).length} known ·{" "}
                {tokens.filter((t) => t.unknown).length} unknown
              </Typography>
              {!sentenceSaved && tokens.filter((t) => t.inVocab).length > 0 && (
                <Button size="small" variant="outlined" startIcon={<BookmarkAddIcon />}
                  onClick={handleSaveSentence} disabled={savingSentence}>
                  Save sentence to bank
                </Button>
              )}
              {sentenceSaved && (
                <Chip size="small" icon={<CheckCircleIcon />} label="Sentence saved" color="success" />
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar("")} message={snackbar} />

      <WordDialog
        open={addDialogOpen}
        decks={decks}
        prefill={addPrefill}
        onClose={() => { setAddDialogOpen(false); setAddDialogToken(null); }}
        onSaved={handleWordSaved}
      />
    </Box>
  );
}

// ── TokenChip ───────────────────────────────────────────────────────────────
function TokenChip({ token, onAdd }: { token: Token; onAdd: () => void }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const isParticle = token.pos === "助詞" || token.pos === "助動詞";
  const particleUsage = PARTICLE_USAGE[token.surface] ?? PARTICLE_USAGE[token.reading];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.3 }}>
      {/* Row 1: furigana — hidden when same as surface to keep height consistent */}
      <Typography
        variant="caption" color="text.secondary" lang="ja"
        sx={{ fontSize: "0.6rem", lineHeight: 1.2, visibility: token.reading !== token.surface ? "visible" : "hidden" }}
      >
        {token.reading}
      </Typography>

      {/* Row 2: chip */}
      <Chip
        size="small"
        label={token.surface}
        lang="ja"
        color={token.inVocab ? "success" : token.unknown ? "error" : posColor(token.pos)}
        variant={token.inVocab ? "filled" : token.unknown ? "filled" : "outlined"}
        icon={token.inVocab ? <CheckCircleIcon /> : token.unknown ? <AddCircleIcon /> : undefined}
        onClick={
          isParticle && particleUsage ? (e) => setAnchorEl(e.currentTarget)
          : token.unknown ? onAdd
          : undefined
        }
        sx={{
          cursor: (isParticle && particleUsage) || token.unknown ? "pointer" : "default",
          fontWeight: 500,
          "& .MuiChip-label": { fontSize: "1rem" },
        }}
      />

      {/* Row 3: POS label */}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", lineHeight: 1.2 }}>
        {posLabel(token.pos)}
      </Typography>

      {/* Row 4: meaning — hidden when not available to preserve height for alignment */}
      <Typography
        variant="caption" color="text.secondary"
        sx={{
          fontSize: "0.6rem", lineHeight: 1.2,
          maxWidth: 100, textAlign: "center",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          visibility: token.meaning ? "visible" : "hidden",
        }}
      >
        {token.meaning || "\u00A0"}
      </Typography>

      {/* Particle usage popover */}
      {isParticle && particleUsage && (
        <Popover
          open={!!anchorEl} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Box sx={{ p: 1.5, maxWidth: 240 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5} lang="ja">
              {token.surface}
            </Typography>
            <Typography variant="body2">{particleUsage}</Typography>
          </Box>
        </Popover>
      )}
    </Box>
  );
}
