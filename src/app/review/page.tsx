"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, Card, CardContent, LinearProgress, Chip, Stack,
  CircularProgress, TextField, Fade, Select, MenuItem, FormControl,
  InputLabel, ToggleButtonGroup, ToggleButton,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FlipIcon from "@mui/icons-material/Flip";
import TuneIcon from "@mui/icons-material/Tune";
import { useRouter } from "next/navigation";
import * as wanakana from "wanakana";
import { localDb, getDeviceId, type LSrsCard, type LWord, type LDeck } from "@/lib/localDb";
import { scheduleCard, dbRowToCard, cardToDbRow, type RatingLabel } from "@/lib/fsrs";
import { useSync } from "@/lib/useSync";

interface ReviewItem { card: LSrsCard; word: LWord; }

const RATING_COLORS: Record<RatingLabel, "error"|"warning"|"success"|"info"> = {
  Again:"error", Hard:"warning", Good:"success", Easy:"info",
};
const RATING_KEYS: Record<string, RatingLabel> = { "1":"Again","2":"Hard","3":"Good","4":"Easy" };

export default function ReviewPage() {
  const [queue, setQueue]       = useState<ReviewItem[]>([]);
  const [current, setCurrent]   = useState(0);
  const [flipped, setFlipped]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [started, setStarted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kanaInput, setKanaInput]   = useState("");
  const [checked, setChecked]   = useState(false);
  const [correct, setCorrect]   = useState<boolean|null>(null);
  const [decks, setDecks]       = useState<LDeck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [mode, setMode]         = useState<"due"|"cram">("due");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { status } = useSync();

  useEffect(() => {
    localDb.decks.toArray().then(setDecks);
  }, [status]); // re-read decks after each sync so new/deleted decks appear

  const startReview = useCallback(async () => {
    setLoading(true); setDone(false); setCurrent(0); setFlipped(false);
    setKanaInput(""); setChecked(false);

    const now = new Date();
    let cards: LSrsCard[];

    if (selectedDeck) {
      const wds = await localDb.wordDecks.where("deckId").equals(selectedDeck).toArray();
      const wordIds = wds.map((wd) => wd.wordId);
      cards = mode === "due"
        ? await localDb.srsCards.where("dueDate").belowOrEqual(now.getTime()).toArray().then((cs) => cs.filter((c) => wordIds.includes(c.wordId)))
        : await localDb.srsCards.where("wordId").anyOf(wordIds).toArray();
    } else {
      cards = mode === "due"
        ? await localDb.srsCards.where("dueDate").belowOrEqual(now.getTime()).toArray()
        : await localDb.srsCards.toArray();
    }

    // Attach word data
    const items: ReviewItem[] = [];
    for (const card of cards) {
      const word = await localDb.words.get(card.wordId);
      if (word) items.push({ card, word });
    }

    // Shuffle
    items.sort(() => Math.random() - 0.5);
    setQueue(items);
    setLoading(false);
    setStarted(true);
    if (items.length === 0) setDone(true);
  }, [selectedDeck, mode]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    wanakana.bind(el, { IMEMode: true });
    return () => wanakana.unbind(el);
  }, [flipped, current, started]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!started || done) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); setFlipped(true); }
      if (flipped && RATING_KEYS[e.key]) handleRate(RATING_KEYS[e.key]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const item = queue[current];

  async function handleRate(rating: RatingLabel) {
    if (!item || submitting) return;
    setSubmitting(true);

    // Update card state in Dexie immediately (offline-capable)
    const fsrsCard = dbRowToCard({
      ...item.card,
      dueDate: new Date(item.card.dueDate),
      lastReview: item.card.lastReview ? new Date(item.card.lastReview) : null,
    });
    const { card: next, log } = scheduleCard(fsrsCard, rating);
    const updated = cardToDbRow(next);

    const now = Date.now();
    await localDb.srsCards.update(item.card.id, {
      ...updated,
      dueDate: updated.dueDate.getTime(),
      lastReview: updated.lastReview?.getTime() ?? null,
      updatedAt: now,
    });

    // Append review log locally (_synced: 0 = will be sent to server on next sync)
    await localDb.reviewLogs.add({
      id: crypto.randomUUID(),
      cardId: item.card.id,
      wordId: item.word.id,
      rating: log.rating,
      reviewedAt: log.review.getTime(),
      elapsedDays: log.elapsed_days,
      deviceId: getDeviceId(),
      _synced: 0,
    });

    // Also hit server API if online (best-effort — sync will reconcile anyway)
    if (navigator.onLine) {
      fetch(`/api/review/${item.card.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      }).catch(() => {}); // fire-and-forget; sync handles it
    }

    setSubmitting(false);
    advanceCard();
  }

  function advanceCard() {
    setFlipped(false); setKanaInput(""); setChecked(false); setCorrect(null);
    if (current + 1 >= queue.length) setDone(true);
    else setCurrent((c) => c + 1);
  }

  function checkAnswer() {
    setChecked(true);
    setCorrect(kanaInput.trim() === item.word.furigana.trim());
    setFlipped(true);
  }

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!started) return (
    <Box sx={{ maxWidth: 480, mx: "auto", pt: 4 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <TuneIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Review</Typography>
      </Stack>
      <Card variant="outlined">
        <CardContent>
          <Stack gap={3}>
            <FormControl fullWidth>
              <InputLabel>Deck</InputLabel>
              <Select value={selectedDeck} label="Deck" onChange={(e) => setSelectedDeck(e.target.value as string)}>
                <MenuItem value="">All decks</MenuItem>
                {decks.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>Mode</Typography>
              <ToggleButtonGroup value={mode} exclusive onChange={(_, v) => v && setMode(v)} fullWidth size="small">
                <ToggleButton value="due">Due only</ToggleButton>
                <ToggleButton value="cram">Cram all</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {mode === "due" ? "Only cards scheduled for today." : "All cards in the deck, ignoring schedule."}
              </Typography>
            </Box>
            <Button variant="contained" size="large" onClick={startReview} disabled={loading}>
              {loading ? <CircularProgress size={20} /> : "Start review"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) return (
    <Box sx={{ textAlign: "center", pt: 8 }}>
      <CheckCircleIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
      <Typography variant="h5" fontWeight={700} gutterBottom>All done!</Typography>
      <Typography color="text.secondary" mb={4}>
        {queue.length === 0 ? "No cards due right now." : `You reviewed ${queue.length} card${queue.length !== 1 ? "s" : ""}.`}
      </Typography>
      <Stack direction="row" gap={2} justifyContent="center">
        <Button variant="outlined" onClick={() => { setStarted(false); setDone(false); }}>Change settings</Button>
        <Button variant="contained" onClick={() => router.push("/")}>Back to dashboard</Button>
      </Stack>
    </Box>
  );

  if (loading || !item) return <Box sx={{ display:"flex", justifyContent:"center", pt:8 }}><CircularProgress /></Box>;

  const isProduction = item.card.direction === 1;
  const progress = (current / queue.length) * 100;

  return (
    <Box sx={{ maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" alignItems="center" gap={2} mb={2}>
        <LinearProgress variant="determinate" value={progress} sx={{ flex:1, height:6, borderRadius:3 }} />
        <Typography variant="caption" color="text.secondary">{current+1} / {queue.length}</Typography>
      </Stack>
      <Stack direction="row" gap={1} mb={2}>
        <Chip size="small" icon={<FlipIcon />} label={isProduction ? "Recall reading" : "Recall meaning"} variant="outlined" />
        {item.word.jlptLevel && <Chip size="small" label={`N${item.word.jlptLevel}`} color="primary" variant="outlined" />}
      </Stack>

      <Card variant="outlined" sx={{ minHeight:220, cursor: !flipped && !isProduction ? "pointer" : "default" }}
        onClick={() => { if (!flipped && !isProduction) setFlipped(true); }}>
        <CardContent sx={{ p:4 }}>
          {!isProduction && (
            <Box>
              <Typography variant="h2" fontWeight={700} lang="ja" textAlign="center" mb={1}>{item.word.kanji}</Typography>
              {flipped ? (
                <Fade in><Box textAlign="center">
                  <Typography variant="body1" color="text.secondary" lang="ja" mb={1}>{item.word.furigana}</Typography>
                  <Typography variant="h5">{item.word.meaning}</Typography>
                </Box></Fade>
              ) : (
                <Typography textAlign="center" color="text.secondary" variant="body2" mt={2}>Tap to reveal · Space</Typography>
              )}
            </Box>
          )}
          {isProduction && (
            <Box>
              <Typography variant="h5" textAlign="center" mb={3}>{item.word.meaning}</Typography>
              {!checked ? (
                <Stack gap={2}>
                  <TextField inputRef={inputRef} fullWidth label="Type reading in romaji" value={kanaInput}
                    onChange={(e) => setKanaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && kanaInput.trim() && checkAnswer()}
                    autoFocus helperText="Romaji → hiragana as you type · Enter to check" />
                  <Button variant="outlined" onClick={checkAnswer} disabled={!kanaInput.trim()}>Check</Button>
                </Stack>
              ) : (
                <Fade in><Box textAlign="center">
                  <Typography variant="h4" lang="ja" color={correct ? "success.main":"error.main"} fontWeight={700} mb={1}>{item.word.furigana}</Typography>
                  <Typography variant="body2" color="text.secondary">{correct ? "✓ Correct!" : `✗ You wrote: ${kanaInput}`}</Typography>
                  <Typography variant="h6" lang="ja" mt={1}>{item.word.kanji}</Typography>
                </Box></Fade>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {flipped && (
        <Fade in>
          <Stack direction="row" gap={1.5} mt={3} justifyContent="center" flexWrap="wrap">
            {(["Again","Hard","Good","Easy"] as RatingLabel[]).map((r,i) => (
              <Button key={r} variant={r==="Good"?"contained":"outlined"} color={RATING_COLORS[r]}
                onClick={() => handleRate(r)} disabled={submitting} sx={{ flex:1, minWidth:72 }}>
                {r}<Typography component="span" variant="caption" sx={{ ml:0.5, opacity:0.6 }}>[{i+1}]</Typography>
              </Button>
            ))}
          </Stack>
        </Fade>
      )}
    </Box>
  );
}
