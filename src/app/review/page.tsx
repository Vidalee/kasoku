"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, Card, CardContent, LinearProgress, Chip, Stack,
  CircularProgress, TextField, Fade, Select, MenuItem, FormControl,
  InputLabel,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TuneIcon from "@mui/icons-material/Tune";
import FlipIcon from "@mui/icons-material/Flip";
import { useRouter } from "next/navigation";
import * as wanakana from "wanakana";
import { localDb, getDeviceId, type LDeck } from "@/lib/localDb";
import { scheduleCard, dbRowToCard, cardToDbRow } from "@/lib/fsrs";
import { useSync } from "@/lib/useSync";
import { buildReviewQueue, getDeckCardCounts, unlockProductionCard, type ReviewItem, type DeckCardCounts } from "@/lib/reviewQueue";

// How long to look ahead for re-queuing learning cards (ms)
const REQUEUE_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

export default function ReviewPage() {
  const [queue, setQueue]           = useState<ReviewItem[]>([]);
  const [current, setCurrent]       = useState(0);
  const [flipped, setFlipped]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [started, setStarted]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kanaInput, setKanaInput]   = useState("");
  const [checked, setChecked]       = useState(false);
  const [correct, setCorrect]       = useState<boolean | null>(null);
  const [decks, setDecks]           = useState<LDeck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [counts, setCounts]         = useState<DeckCardCounts | null>(null);
  const [clearedCount, setClearedCount] = useState(0);
  const [initialTotal, setInitialTotal]   = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { status } = useSync();

  useEffect(() => {
    localDb.decks.toArray().then(setDecks);
  }, [status]);

  useEffect(() => {
    getDeckCardCounts(selectedDeck || null).then(setCounts);
  }, [selectedDeck, status]);

  const startReview = useCallback(async () => {
    setLoading(true); setDone(false); setCurrent(0); setFlipped(false);
    setKanaInput(""); setChecked(false); setCorrect(null); setClearedCount(0); setInitialTotal(0);

    const items = await buildReviewQueue(selectedDeck || null);
    setQueue(items);
    setInitialTotal(items.length);
    setLoading(false);
    setStarted(true);
    if (items.length === 0) setDone(true);
  }, [selectedDeck]);

  // Bind wanakana to input on direction=1 cards
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    wanakana.bind(el, { IMEMode: true });
    return () => wanakana.unbind(el);
  }, [flipped, current, started]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!started || done) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); setFlipped(true); }
      if (flipped) {
        if (e.key === "1") handleRate(false); // Fail
        if (e.key === "2") handleRate(true);  // Pass
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const item = queue[current];

  async function handleRate(pass: boolean) {
    if (!item || submitting) return;
    setSubmitting(true);

    const rating = pass ? "Good" : "Again";
    const fsrsCard = dbRowToCard({
      ...item.card,
      dueDate: new Date(item.card.dueDate),
      lastReview: item.card.lastReview ? new Date(item.card.lastReview) : null,
    });
    const { card: next, log } = scheduleCard(fsrsCard, rating);
    const updated = cardToDbRow(next);
    const now = Date.now();
    const logId = crypto.randomUUID();

    await localDb.srsCards.update(item.card.id, {
      ...updated,
      dueDate: updated.dueDate.getTime(),
      lastReview: updated.lastReview?.getTime() ?? null,
      updatedAt: now,
    });

    await localDb.reviewLogs.add({
      id: logId,
      cardId: item.card.id,
      wordId: item.word.id,
      rating: log.rating,
      reviewedAt: log.review.getTime(),
      elapsedDays: log.elapsed_days,
      deviceId: getDeviceId(),
      _synced: 0,
    });

    if (navigator.onLine) {
      fetch(`/api/review/${item.card.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, logId }),
      }).catch(() => {});
    }

    // Unlock direction 1 (production) on first pass of direction 0 (recognition)
    if (pass && item.card.direction === 0) {
      unlockProductionCard(item.word.id, getDeviceId).then((result) => {
        if (result && navigator.onLine) {
          fetch(`/api/review/${result.cardId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: "Good", logId: result.logId }),
          }).catch(() => {});
        }
      });
    }

    // Re-queue learning/relearning cards that will be due soon
    const newDueDate = updated.dueDate.getTime();
    const shouldRequeue =
      (next.state === 1 || next.state === 3) &&
      newDueDate <= now + REQUEUE_WINDOW_MS;

    if (!shouldRequeue) setClearedCount((n) => n + 1);

    setQueue((prev) => {
      const rest = prev.slice(current + 1);
      if (shouldRequeue) {
        // Insert at end of queue so it comes back after current remaining cards
        return [...rest, { ...item, card: { ...item.card, ...updated, dueDate: newDueDate, lastReview: updated.lastReview?.getTime() ?? null, updatedAt: now } }];
      }
      return rest;
    });
    setCurrent(0);
    setSubmitting(false);
    setFlipped(false);
    setKanaInput("");
    setChecked(false);
    setCorrect(null);
  }

  function checkAnswer() {
    // Read from DOM ref — wanakana may have already converted the last syllable
    // while the React state still lags behind (e.g. "はなs" vs "はなす")
    const actual = inputRef.current?.value ?? kanaInput;
    setKanaInput(actual);
    setChecked(true);
    setCorrect(actual.trim() === item.word.furigana.trim());
    setFlipped(true);
  }

  // Derive done from queue being empty after start
  useEffect(() => {
    if (started && !loading && queue.length === 0) setDone(true);
  }, [queue, started, loading]);

  // ── Setup screen ────────────────────────────────────────────────────────────
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

            {counts && (
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip size="small" label={`${counts.dueReview} due`} color={counts.dueReview > 0 ? "primary" : "default"} variant="outlined" />
                <Chip size="small" label={`${counts.learning} learning`} color={counts.learning > 0 ? "warning" : "default"} variant="outlined" />
                <Chip size="small" label={`${counts.newAvailable} new available`} variant="outlined" />
              </Stack>
            )}

            <Button variant="contained" size="large" onClick={startReview}
              disabled={loading || (counts != null && counts.dueReview === 0 && counts.learning === 0)}>
              {loading ? <CircularProgress size={20} /> : "Start review"}
            </Button>
            {counts != null && counts.dueReview === 0 && counts.learning === 0 && (
              <Typography variant="caption" color="text.secondary" textAlign="center">
                Nothing due right now. Come back later or use Learn to introduce new words.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (done) return (
    <Box sx={{ textAlign: "center", pt: 8 }}>
      <CheckCircleIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
      <Typography variant="h5" fontWeight={700} gutterBottom>All done!</Typography>
      <Typography color="text.secondary" mb={4}>
        {clearedCount === 0
          ? "No cards due right now."
          : `You reviewed ${clearedCount} card${clearedCount !== 1 ? "s" : ""}.`}
      </Typography>
      <Stack direction="row" gap={2} justifyContent="center">
        <Button variant="outlined" onClick={() => { setStarted(false); setDone(false); }}>Change settings</Button>
        <Button variant="contained" onClick={() => router.push("/")}>Back to dashboard</Button>
      </Stack>
    </Box>
  );

  if (loading || !item) return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>;

  const isProduction = item.card.direction === 1;
  const isLearning   = item.card.state === 1 || item.card.state === 3;

  const newCount      = queue.filter((i) => i.card.state === 0).length;
  const learningCount = queue.filter((i) => i.card.state === 1 || i.card.state === 3).length;
  const dueCount      = queue.filter((i) => i.card.state === 2).length;

  return (
    <Box sx={{ maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" alignItems="center" gap={2} mb={2}>
        <LinearProgress variant="determinate" value={initialTotal > 0 ? Math.min(100, (clearedCount / initialTotal) * 100) : 0}
          sx={{ flex: 1, height: 6, borderRadius: 3 }} />
        <Stack direction="row" gap={1.5}>
          <Typography variant="caption" fontWeight={700} color="info.main">{newCount}</Typography>
          <Typography variant="caption" fontWeight={700} color="error.main">{learningCount}</Typography>
          <Typography variant="caption" fontWeight={700} color="success.main">{dueCount}</Typography>
        </Stack>
      </Stack>

      <Stack direction="row" gap={1} mb={2}>
        <Chip size="small" icon={<FlipIcon />} label={isProduction ? "Recall reading" : "Recall meaning"} variant="outlined" />
        {isLearning && <Chip size="small" label="Learning" color="warning" variant="outlined" />}
        {item.word.jlptLevel && <Chip size="small" label={`N${item.word.jlptLevel}`} color="primary" variant="outlined" />}
      </Stack>

      <Card variant="outlined" sx={{ minHeight: 220, cursor: !flipped && !isProduction ? "pointer" : "default" }}
        onClick={() => { if (!flipped && !isProduction) setFlipped(true); }}>
        <CardContent sx={{ p: 4 }}>

          {/* Direction 0 — recognition */}
          {!isProduction && (
            <Box>
              <Typography variant="h2" fontWeight={700} lang="ja" textAlign="center" mb={1}>{item.word.kanji}</Typography>
              {flipped ? (
                <Fade in><Box textAlign="center">
                  <Typography variant="body1" color="text.secondary" lang="ja" mb={1}>{item.word.furigana}</Typography>
                  <Typography variant="h5">{item.word.meaning}</Typography>
                </Box></Fade>
              ) : (
                <Typography textAlign="center" color="text.secondary" variant="body2" mt={2}>
                  Tap to reveal · Space
                </Typography>
              )}
            </Box>
          )}

          {/* Direction 1 — production */}
          {isProduction && (
            <Box>
              <Typography variant="h5" textAlign="center" mb={3}>{item.word.meaning}</Typography>
              {!checked ? (
                <Stack gap={2}>
                  <TextField inputRef={inputRef} fullWidth label="Type reading in romaji" value={kanaInput}
                    onChange={(e) => setKanaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (inputRef.current?.value ?? kanaInput).trim() && checkAnswer()}
                    autoFocus helperText="Romaji → hiragana as you type · Enter to check" />
                  <Button variant="outlined" onClick={checkAnswer} disabled={!(inputRef.current?.value ?? kanaInput).trim()}>Check</Button>
                </Stack>
              ) : (
                <Fade in><Box textAlign="center">
                  <Typography variant="h4" lang="ja" color={correct ? "success.main" : "error.main"} fontWeight={700} mb={0.5}>
                    {item.word.furigana}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    {correct ? "✓ Correct!" : `✗ You wrote: ${kanaInput}`}
                  </Typography>
                  <Typography variant="h5" lang="ja" fontWeight={700} mb={1}>{item.word.kanji}</Typography>
                  {item.sentence && (
                    <Typography variant="body2" lang="ja" color="text.secondary" lineHeight={2}>
                      {item.sentence.japanese.split(item.word.kanji).flatMap((part, i, arr) =>
                        i < arr.length - 1
                          ? [part, <Typography key={i} component="span" fontWeight={700} lang="ja">{item.word.kanji}</Typography>]
                          : [part]
                      )}
                    </Typography>
                  )}
                  {item.sentence?.english && (
                    <Typography variant="body2" color="text.secondary" mt={0.5} fontStyle="italic">
                      {item.sentence.english}
                    </Typography>
                  )}
                </Box></Fade>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Rating buttons — shown after flip (dir 0) or after check (dir 1) */}
      {flipped && (
        <Fade in>
          <Stack direction="row" gap={2} mt={3} justifyContent="center">
            <Button variant="outlined" color="error" onClick={() => handleRate(false)}
              disabled={submitting} sx={{ flex: 1, py: 1.5 }}>
              Fail <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.6 }}>[1]</Typography>
            </Button>
            <Button variant="contained" color="success" onClick={() => handleRate(true)}
              disabled={submitting} sx={{ flex: 1, py: 1.5 }}>
              Pass <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.6 }}>[2]</Typography>
            </Button>
          </Stack>
        </Fade>
      )}
    </Box>
  );
}
