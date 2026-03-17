"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, CardContent, LinearProgress, Chip, Stack,
  CircularProgress, Select, MenuItem, FormControl, InputLabel, Slider,
  Fade,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import { useRouter } from "next/navigation";
import { localDb, getDeviceId, type LDeck } from "@/lib/localDb";
import { scheduleCard, dbRowToCard, cardToDbRow } from "@/lib/fsrs";
import { useSync } from "@/lib/useSync";
import { buildLearnQueue, getNewCardsIntroducedToday, type LearningCard } from "@/lib/reviewQueue";

const CORRECT_TO_GRADUATE = 3;

interface SessionCard extends LearningCard {
  seen: boolean;
}

export default function LearnPage() {
  const [decks, setDecks]                 = useState<LDeck[]>([]);
  const [selectedDeck, setSelectedDeck]   = useState<string>("");
  const [newAvailable, setNewAvailable]   = useState<number>(0);
  const [deckWordCount, setDeckWordCount] = useState<number>(0);
  const [introducedToday, setIntroducedToday] = useState<number>(0);
  const [count, setCount]                 = useState(10);
  const [loading, setLoading]             = useState(false);
  const [started, setStarted]             = useState(false);
  const [done, setDone]                   = useState(false);

  const [batch, setBatch]                 = useState<SessionCard[]>([]);
  const [queueIdxs, setQueueIdxs]         = useState<number[]>([]);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [flipped, setFlipped]             = useState(false); // answer revealed

  const router = useRouter();
  const { status } = useSync();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!started || done) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        const idx = queueIdxs[0];
        const current = batch[idx];
        if (current?.seen && !flipped) setFlipped(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    localDb.decks.toArray().then(setDecks);
  }, [status]);

  useEffect(() => {
    if (!selectedDeck) { setNewAvailable(0); return; }
    (async () => {
      const wds = await localDb.wordDecks.where("deckId").equals(selectedDeck).toArray();
      const wordIds = new Set(wds.map((wd) => wd.wordId));
      setDeckWordCount(wordIds.size);
      const allNew = await localDb.srsCards
        .filter((c) => c.state === 0 && c.direction === 0 && wordIds.has(c.wordId))
        .toArray();
      const deck = await localDb.decks.get(selectedDeck);
      const todayCount = await getNewCardsIntroducedToday(selectedDeck);
      setIntroducedToday(todayCount);
      const limit = deck?.dailyNewCardLimit ?? null;
      const remaining = limit != null ? Math.max(0, limit - todayCount) : allNew.length;
      setNewAvailable(Math.min(allNew.length, remaining));
      setCount((prev) => Math.min(prev, Math.min(allNew.length, remaining)));
    })();
  }, [selectedDeck, status]);

  const startSession = useCallback(async () => {
    if (!selectedDeck || count === 0) return;
    setLoading(true);
    const items = await buildLearnQueue(selectedDeck, count);
    const session: SessionCard[] = items.map((item) => ({ ...item, seen: false }));
    setBatch(session);
    setQueueIdxs(session.map((_, i) => i));
    setGraduatedCount(0);
    setFlipped(false);
    setLoading(false);
    setStarted(true);
    setDone(false);
  }, [selectedDeck, count]);

  async function graduateAll(finalBatch: SessionCard[]) {
    const now = Date.now();
    for (const item of finalBatch) {
      const fsrsCard = dbRowToCard({
        ...item.card,
        dueDate: new Date(item.card.dueDate),
        lastReview: item.card.lastReview ? new Date(item.card.lastReview) : null,
      });
      const { card: next0, log: log0 } = scheduleCard(fsrsCard, "Good");
      const updated0 = cardToDbRow(next0);
      const logId0 = crypto.randomUUID();
      await localDb.srsCards.update(item.card.id, {
        ...updated0,
        dueDate: now, // due immediately so review queue picks them up right away
        lastReview: updated0.lastReview?.getTime() ?? null,
        updatedAt: now,
      });
      await localDb.reviewLogs.add({
        id: logId0,
        cardId: item.card.id,
        wordId: item.word.id,
        rating: log0.rating,
        reviewedAt: log0.review.getTime(),
        elapsedDays: log0.elapsed_days,
        deviceId: getDeviceId(),
        _synced: 0,
      });

      if (navigator.onLine) {
        fetch(`/api/review/${item.card.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: "Good", logId: logId0 }),
        }).catch(() => {});
      }
    }
  }

  // Called after the answer is revealed — user rates themselves
  function handleRate(correct: boolean) {
    const currentIdx = queueIdxs[0];
    const rest = queueIdxs.slice(1);
    const newCorrectCount = correct
      ? batch[currentIdx].correctCount + 1
      : batch[currentIdx].correctCount;

    const newBatch = batch.map((item, i) =>
      i === currentIdx ? { ...item, seen: true, correctCount: newCorrectCount } : item
    );

    if (newCorrectCount >= CORRECT_TO_GRADUATE) {
      const newGrad = graduatedCount + 1;
      if (rest.length === 0) {
        setBatch(newBatch);
        setQueueIdxs([]);
        setGraduatedCount(newGrad);
        setFlipped(false);
        graduateAll(newBatch).then(() => setDone(true));
      } else {
        setBatch(newBatch);
        setQueueIdxs(rest);
        setGraduatedCount(newGrad);
        setFlipped(false);
      }
    } else if (!correct) {
      const insertAt = Math.min(3, rest.length);
      const newQueue = [...rest];
      newQueue.splice(insertAt, 0, currentIdx);
      setBatch(newBatch);
      setQueueIdxs(newQueue);
      setFlipped(false);
    } else {
      setBatch(newBatch);
      setQueueIdxs([...rest, currentIdx]);
      setFlipped(false);
    }
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) return (
    <Box sx={{ maxWidth: 480, mx: "auto", pt: 4 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <AutoStoriesIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Learn</Typography>
      </Stack>
      <Card variant="outlined">
        <CardContent>
          <Stack gap={3}>
            <FormControl fullWidth>
              <InputLabel>Deck</InputLabel>
              <Select value={selectedDeck} label="Deck"
                onChange={(e) => setSelectedDeck(e.target.value as string)}>
                <MenuItem value="" disabled>Select a deck</MenuItem>
                {decks.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>

            {selectedDeck && (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    New words today: {count}
                    {introducedToday > 0 && ` (${introducedToday} already introduced today)`}
                  </Typography>
                  <Slider
                    value={count}
                    min={1}
                    max={Math.max(1, newAvailable)}
                    step={1}
                    disabled={newAvailable === 0}
                    onChange={(_, v) => setCount(v as number)}
                    marks={[
                      { value: 1, label: "1" },
                      { value: Math.max(1, newAvailable), label: String(Math.max(1, newAvailable)) },
                    ]}
                  />
                </Box>
                {newAvailable === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {deckWordCount === 0
                      ? "This deck has no words yet. Add words in the Vocabulary page and assign them to this deck."
                      : introducedToday > 0
                      ? `Daily limit reached (${introducedToday} introduced today). Come back tomorrow or raise the limit in deck settings.`
                      : "All words in this deck have already been introduced."}
                  </Typography>
                )}
              </>
            )}

            <Button variant="contained" size="large" onClick={startSession}
              disabled={loading || !selectedDeck || newAvailable === 0 || count === 0}>
              {loading ? <CircularProgress size={20} /> : `Start (${count} word${count !== 1 ? "s" : ""})`}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (done) return (
    <Box sx={{ textAlign: "center", pt: 8 }}>
      <CheckCircleIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
      <Typography variant="h5" fontWeight={700} gutterBottom>Session complete!</Typography>
      <Typography color="text.secondary" mb={4}>
        {graduatedCount} word{graduatedCount !== 1 ? "s" : ""} introduced. They&apos;re ready to review now.
      </Typography>
      <Stack direction="row" gap={2} justifyContent="center">
        <Button variant="outlined" onClick={() => { setStarted(false); setDone(false); }}>Learn more</Button>
        <Button variant="contained" onClick={() => router.push("/review")}>Go to review</Button>
      </Stack>
    </Box>
  );

  if (loading || queueIdxs.length === 0) return (
    <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>
  );

  const currentIdx = queueIdxs[0];
  const item = batch[currentIdx];
  const isFirstEncounter = !item.seen;
  const total = batch.length;

  return (
    <Box sx={{ maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" alignItems="center" gap={2} mb={2}>
        <LinearProgress variant="determinate" value={(graduatedCount / total) * 100}
          sx={{ flex: 1, height: 6, borderRadius: 3 }} />
        <Typography variant="caption" color="text.secondary">{graduatedCount} / {total}</Typography>
      </Stack>

      <Stack direction="row" gap={1} mb={2}>
        {isFirstEncounter
          ? <Chip size="small" label="New word" color="primary" variant="outlined" />
          : <Chip size="small" label={`${item.correctCount} / ${CORRECT_TO_GRADUATE} correct`} variant="outlined" />}
        {item.word.jlptLevel && <Chip size="small" label={`N${item.word.jlptLevel}`} color="primary" variant="outlined" />}
      </Stack>

      <Card variant="outlined" sx={{ minHeight: 240,
        cursor: !isFirstEncounter && !flipped ? "pointer" : "default" }}
        onClick={() => { if (!isFirstEncounter && !flipped) setFlipped(true); }}>
        <CardContent sx={{ p: 4 }}>
          {isFirstEncounter ? (
            // First encounter: full presentation
            <Fade in key={`intro-${currentIdx}`}>
              <Box>
                <Typography variant="h2" fontWeight={700} lang="ja" textAlign="center" mb={1}>
                  {item.word.kanji}
                </Typography>
                <Typography variant="h5" color="text.secondary" lang="ja" textAlign="center" mb={2}>
                  {item.word.furigana}
                </Typography>
                <Typography variant="h5" textAlign="center" mb={3}>
                  {item.word.meaning}
                </Typography>
                {item.sentence && (
                  <Box sx={{ borderLeft: "3px solid", borderColor: "primary.main", pl: 2, mt: 2 }}>
                    <Typography variant="body1" lang="ja" lineHeight={2}>
                      {item.sentence.japanese}
                    </Typography>
                    {item.sentence.english && (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        {item.sentence.english}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Fade>
          ) : !flipped ? (
            // Quiz — show kanji, prompt to flip
            <Fade in key={`quiz-${currentIdx}-${item.correctCount}`}>
              <Box textAlign="center">
                <Typography variant="h2" fontWeight={700} lang="ja" mb={1}>
                  {item.word.kanji}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={2}>
                  Tap to reveal · Space
                </Typography>
              </Box>
            </Fade>
          ) : (
            // Flipped — show full answer
            <Fade in key={`answer-${currentIdx}-${item.correctCount}`}>
              <Box>
                <Typography variant="h2" fontWeight={700} lang="ja" textAlign="center" mb={1}>
                  {item.word.kanji}
                </Typography>
                <Typography variant="h5" color="text.secondary" lang="ja" textAlign="center" mb={1}>
                  {item.word.furigana}
                </Typography>
                <Typography variant="h5" textAlign="center" mb={2}>
                  {item.word.meaning}
                </Typography>
                {item.sentence && (
                  <Box sx={{ borderLeft: "3px solid", borderColor: "primary.main", pl: 2, mt: 1 }}>
                    <Typography variant="body1" lang="ja" lineHeight={2}>
                      {item.sentence.japanese}
                    </Typography>
                    {item.sentence.english && (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        {item.sentence.english}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Fade>
          )}
        </CardContent>
      </Card>

      <Stack direction="row" gap={2} mt={3} justifyContent="center">
        {isFirstEncounter ? (
          <Button variant="contained" size="large" fullWidth onClick={() => handleRate(true)}>
            Got it, next
          </Button>
        ) : !flipped ? (
          <Button variant="outlined" size="large" fullWidth onClick={() => setFlipped(true)}>
            Reveal answer
          </Button>
        ) : (
          <>
            <Button variant="outlined" color="error" onClick={() => handleRate(false)}
              sx={{ flex: 1, py: 1.5 }}>
              Forgot
            </Button>
            <Button variant="contained" color="success" onClick={() => handleRate(true)}
              sx={{ flex: 1, py: 1.5 }}>
              Remembered
            </Button>
          </>
        )}
      </Stack>
    </Box>
  );
}
