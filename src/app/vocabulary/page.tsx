"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Chip, MenuItem, Select, InputLabel, FormControl,
  Card, CardContent, InputAdornment, Stack, Menu, Skeleton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { WordDialog, type Word, type Deck } from "@/components/WordDialog";

const JLPT_LEVELS = [5, 4, 3, 2, 1];

interface Sentence { id: string; japanese: string; english: string; source: string; }

export default function VocabularyPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [search, setSearch] = useState("");
  const [jlptFilter, setJlptFilter] = useState<string>("");
  const [deckFilter, setDeckFilter] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [editWord, setEditWord] = useState<Word | null>(null);
  const [detailWord, setDetailWord] = useState<Word | null>(null);
  const [loading, setLoading] = useState(true);
  const isFirstRender = useRef(true);

  const fetchWords = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (jlptFilter) p.set("jlpt", jlptFilter);
    if (deckFilter) p.set("deck", deckFilter);
    const res = await fetch(`/api/words?${p}`);
    setWords((await res.json()).words ?? []);
    setLoading(false);
  }, [search, jlptFilter, deckFilter]);

  useEffect(() => {
    fetch("/api/decks").then((r) => r.json()).then((d) => setDecks(d.decks ?? []));
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      fetchWords();
      return;
    }
    const t = setTimeout(fetchWords, 300);
    return () => clearTimeout(t);
  }, [fetchWords]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this word? SRS progress will also be lost.")) return;
    await fetch(`/api/words/${id}`, { method: "DELETE" });
    fetchWords();
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>Vocabulary</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditWord(null); setAddOpen(true); }}>Add word</Button>
      </Stack>

      <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
        <TextField placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} size="small"
          sx={{ flex: 1, minWidth: 180 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>JLPT</InputLabel>
          <Select value={jlptFilter} label="JLPT" onChange={(e) => setJlptFilter(e.target.value as string)}>
            <MenuItem value="">All</MenuItem>
            {JLPT_LEVELS.map((l) => <MenuItem key={l} value={l}>N{l}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Deck</InputLabel>
          <Select value={deckFilter} label="Deck" onChange={(e) => setDeckFilter(e.target.value as string)}>
            <MenuItem value="">All</MenuItem>
            {decks.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 2 }}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} variant="outlined">
              <CardContent>
                <Skeleton variant="text" width="60%" height={36} />
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="80%" sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {words.map((w) => (
              <WordCard key={w.id} word={w}
                onClick={() => setDetailWord(w)}
                onEdit={() => { setEditWord(w); setAddOpen(true); }}
                onDelete={() => handleDelete(w.id)} />
            ))}
            {words.length === 0 && (
              <Typography color="text.secondary" sx={{ gridColumn: "1/-1", py: 4, textAlign: "center" }}>
                No words yet. Add your first word!
              </Typography>
            )}
          </>
        )}
      </Box>

      <WordDialog open={addOpen} word={editWord} decks={decks} onClose={() => setAddOpen(false)} onSaved={fetchWords} />
      <WordDetailDialog word={detailWord} onClose={() => setDetailWord(null)} onEdit={() => { setEditWord(detailWord); setAddOpen(true); setDetailWord(null); }} />
    </Box>
  );
}

function WordCard({ word, onClick, onEdit, onDelete }: { word: Word; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  return (
    <Card variant="outlined" sx={{ cursor: "pointer", "&:hover": { borderColor: "primary.main" } }} onClick={onClick}>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={700} lang="ja" noWrap>{word.kanji}</Typography>
            <Typography variant="body2" color="text.secondary" lang="ja">{word.furigana}</Typography>
          </Box>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {word.jlptLevel && <Chip label={`N${word.jlptLevel}`} size="small" color="primary" variant="outlined" />}
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}><MoreVertIcon fontSize="small" /></IconButton>
          </Stack>
        </Stack>
        <Typography variant="body1" mt={1}>{word.meaning}</Typography>
        {word.tags.length > 0 && (
          <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
            {word.tags.map((t) => <Chip key={t} label={t} size="small" />)}
          </Stack>
        )}
      </CardContent>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
        <MenuItem onClick={() => { setAnchor(null); onEdit(); }}><EditIcon fontSize="small" sx={{ mr: 1 }} />Edit</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: "error.main" }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} />Delete</MenuItem>
      </Menu>
    </Card>
  );
}


function WordDetailDialog({ word, onClose, onEdit }: { word: Word | null; onClose: () => void; onEdit: () => void }) {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!word) { setSentences([]); return; }
    setLoading(true);
    fetch(`/api/words/${word.id}/sentences`)
      .then((r) => r.json())
      .then((d) => setSentences(d.sentences ?? []))
      .finally(() => setLoading(false));
  }, [word]);

  return (
    <Dialog open={!!word} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" alignItems="baseline" gap={1.5}>
          <Typography variant="h5" fontWeight={700} lang="ja">{word?.kanji}</Typography>
          <Typography variant="body1" color="text.secondary" lang="ja">{word?.furigana}</Typography>
          {word?.jlptLevel && <Chip label={`N${word.jlptLevel}`} size="small" color="primary" variant="outlined" />}
        </Stack>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" mb={2}>{word?.meaning}</Typography>
        {word?.tags && word.tags.length > 0 && (
          <Stack direction="row" gap={0.5} flexWrap="wrap" mb={2}>
            {word.tags.map((t) => <Chip key={t} label={t} size="small" />)}
          </Stack>
        )}
        <Stack direction="row" alignItems="center" gap={1} mb={1}>
          <FormatListBulletedIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={600}>Example sentences</Typography>
        </Stack>
        {loading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
        {!loading && sentences.length === 0 && (
          <Typography variant="body2" color="text.secondary">No sentences linked to this word.</Typography>
        )}
        {!loading && sentences.length > 0 && (
          <Stack gap={1.5}>
            {sentences.map((s) => (
              <Box key={s.id} sx={{ borderLeft: "3px solid", borderColor: "primary.main", pl: 1.5 }}>
                <Typography variant="body1" lang="ja">{s.japanese}</Typography>
                {s.english && <Typography variant="body2" color="text.secondary">{s.english}</Typography>}
                <Typography variant="caption" color="text.disabled">{s.source}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit word</Button>
      </DialogActions>
    </Dialog>
  );
}
